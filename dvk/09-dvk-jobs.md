[目次](../README.md) › [@angular-devkit の内側](README.md) › 第 9 回 / 全 12 回

# architect の jobs：scheduler・registry・strategy

> architect/src/jobs/\*：Job の約束（引数・入力・出力のメッセージと state）、SimpleJobRegistry と SimpleScheduler、createJobHandler、購読・stop・ping、strategy（serialize・reuse・memoize）を同時に呼んだときの回数、dispatcher、README と実装の食い違い。

angular/angular-cli · 読了 約 13 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/dvk-jobs)

---

この章で分かること：builder の下で動く `jobs`（名前の付いた関数を、型の決まった引数・入力・出力のメッセージで動かす仕組み）の約束と、`SimpleJobRegistry`（名前 → 関数の表）と `SimpleScheduler`（job を作って走らせる係）が、どの順にどのメッセージを出すか。`createJobHandler` が普通の関数を job にする方法と、同時に呼んだときの回数を変える `strategy`（`serialize`・`reuse`・`memoize`）です。説明文（README と JSDoc）と動きの食い違いも並べます。

読む対象は `packages/angular_devkit/architect/src/jobs/` の `api.ts`・`create-job-handler.ts`・`simple-registry.ts`・`simple-scheduler.ts`・`strategy.ts`・`dispatcher.ts`・`README.md` です（../angular-cli、44129f66a3）。`Architect` がこの scheduler に 4 つの registry を並べて builder を job として呼ぶ所は[builder を探し出す章](../boot/02-boot-architect.md)、その続きは[次の回](10-dvk-architect.md)です。

1. [1. パスと文字列](01-dvk-path.md)
2. [2. 仮想ファイルシステムの host](02-dvk-host.md)
3. [3. JSON schema の検査](03-dvk-schema.md)
4. [4. angular.json の読み書き](04-dvk-workspace.md)
5. [5. logger と小さな道具](05-dvk-logger.md)
6. [6. Tree](06-dvk-tree.md)
7. [7. エンジンと規則](07-dvk-engine.md)
8. [8. ワークフローと engine host](08-dvk-workflow.md)
9. **9. architect の jobs**（この章）
10. [10. Architect が builder を呼ぶまで](10-dvk-architect.md)
11. [11. テストの道具](11-dvk-testing.md)
12. [12. spec と issue](12-dvk-tests-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> DEMO の記録は、ローカルの `@angular/cli` 22.2.7 が持つ `@angular-devkit/architect` 0.2202.7 の `jobs` を Node から直接使って取りました。`src/jobs/` は 44129f66a3 と v22.2.7 で同じです。jobs は 2018-11 に `@angular-devkit/core` に入り（a3a657f7e7）、2022-10 に `@angular-devkit/architect` へ移りました（93adeeb798、`move experimental jobs API`）。今の import は `import { jobs } from '@angular-devkit/architect'` です。

## 1. job の約束：関数と説明、2 本のバス

📄 `angular-cli/packages/angular_devkit/architect/src/jobs/README.md` L3–11 （▶ の行: 3–4, 7, 10–11）

```md
 3 ▶ Jobs is the Angular DevKit subsystem for scheduling and running generic functions with clearly
 4 ▶ typed inputs and outputs. A `Job` instance is a function associated with metadata. You can
 5 │ schedule a job, synchronize it with other jobs, and use it to schedule other jobs.
 6 │ 
 7 ▶ The whole API is serializable, allowing you to use a Node Stream or message channel to
 8 │ communicate between the job and the job scheduler.
 9 │ 
10 ▶ Jobs are lazy, cold, and guaranteed to execute exactly once when scheduled. Subscribing to a job
11 ▶ returns messages from the point where the job is at.
```

📄 `angular-cli/packages/angular_devkit/architect/src/jobs/api.ts` L18–49 （▶ の行: 21, 26–29, 31, 42–43, 46, 48）

```ts
18 │ /**
19 │  * The job handler function, which is a method that's executed for the job.
20 │  */
21 ▶ export interface JobHandler<
22 │   ArgT extends JsonValue,
23 │   InputT extends JsonValue,
24 │   OutputT extends JsonValue,
25 │ > {
26 ▶   (
27 ▶     argument: ArgT,
28 ▶     context: JobHandlerContext<ArgT, InputT, OutputT>,
29 ▶   ): Observable<JobOutboundMessage<OutputT>>;
30 │ 
31 ▶   jobDescription: Partial<JobDescription>;
32 │ }
33 │ 
34 │ /**
35 │  * The context in which the job is run.
36 │  */
37 │ export interface JobHandlerContext<
38 │   MinimumArgumentValueT extends JsonValue = JsonValue,
39 │   MinimumInputValueT extends JsonValue = JsonValue,
40 │   MinimumOutputValueT extends JsonValue = JsonValue,
41 │ > {
42 ▶   readonly description: JobDescription;
43 ▶   readonly scheduler: Scheduler<JsonValue, JsonValue, JsonValue>;
44 │ 
45 │   // In this context, JsonValue is comparable to `any`.
46 ▶   readonly dependencies: Job<JsonValue, JsonValue, JsonValue>[];
47 │ 
48 ▶   readonly inboundBus: Observable<JobInboundMessage<MinimumInputValueT>>;
49 │ }
```

job の中身は 26〜29 行目の関数と、31 行目の `jobDescription`（名前と 3 つの JSON schema）です。関数は引数と context を受け取り、**メッセージ**の Observable を返します。42〜48 行目の context には、説明・scheduler（中から別の job を呼べる）・依存の job・入ってくるメッセージ（`inboundBus`）があります。README の 7 行目のとおり、全部が JSON にできる形なのは、別のプロセスとメッセージでやりとりできるようにするためです。

📄 `angular-cli/packages/angular_devkit/architect/src/jobs/api.ts` L62–73 （▶ の行: 66–67, 70–71）

```ts
62 │ /**
63 │  * Messages that can be sent TO a job. The job needs to listen to those.
64 │  */
65 │ export enum JobInboundMessageKind {
66 ▶   Ping = 'ip',
67 ▶   Stop = 'is',
68 │ 
69 │   // Channel specific messages.
70 ▶   Input = 'in',
71 ▶   // Input channel does not allow completion / error. Erroring this will just close the Subject
72 │   // but not notify the job.
73 │ }
```

📄 `angular-cli/packages/angular_devkit/architect/src/jobs/api.ts` L123–141 （▶ の行: 128–131, 134, 137）

```ts
123 │ /**
124 │  * Kind of messages that can be outputted from a job.
125 │  */
126 │ export enum JobOutboundMessageKind {
127 │   // Lifecycle specific messages.
128 ▶   OnReady = 'c',
129 ▶   Start = 's',
130 ▶   End = 'e',
131 ▶   Pong = 'p',
132 │ 
133 │   // Feedback messages.
134 ▶   Output = 'o',
135 │ 
136 │   // Channel specific messages.
137 ▶   ChannelCreate = 'cn',
138 │   ChannelMessage = 'cm',
139 │   ChannelError = 'ce',
140 │   ChannelComplete = 'cc',
141 │ }
```

job へのメッセージ（inbound）は Ping・Stop・Input の 3 つ、job からのメッセージ（outbound）は OnReady（`c`）・Start（`s`）・End（`e`）・Pong（`p`）・Output（`o`）と 4 つのチャンネルのものです。DEMO の記録の `{"kind":"c"}` などはこの 1〜2 文字です。

📄 `angular-cli/packages/angular_devkit/architect/src/jobs/api.ts` L270–300 （▶ の行: 277, 280–281, 283, 289, 294, 299）

```ts
270 │ /**
271 │  * The state of a job. These are changed as the job reports a new state through its messages.
272 │  */
273 │ export enum JobState {
274 │   /**
275 │    * The job was queued and is waiting to start.
276 │    */
277 ▶   Queued = 'queued',
278 │ 
279 │   /**
280 ▶    * The job description was found, its dependencies (see "Synchronizing and Dependencies")
281 ▶    * are done running, and the job's argument is validated and the job's code will be executed.
282 │    */
283 ▶   Ready = 'ready',
284 │ 
285 │   /**
286 │    * The job has been started. The job implementation is expected to send this as soon as its
287 │    * work is starting.
288 │    */
289 ▶   Started = 'started',
290 │ 
291 │   /**
292 │    * The job has ended and is done running.
293 │    */
294 ▶   Ended = 'ended',
295 │ 
296 │   /**
297 │    * An error occured and the job stopped because of internal state.
298 │    */
299 ▶   Errored = 'errored',
300 │ }
```

📄 `angular-cli/packages/angular_devkit/architect/src/jobs/api.ts` L336–363 （▶ の行: 341, 344, 346, 348–349, 352, 357, 362）

```ts
336 │   /**
337 │    * Get a channel that validates against the schema. Messages will be filtered by the schema.
338 │    * @param name The name of the channel.
339 │    * @param schema A schema to use to validate messages.
340 │    */
341 ▶   getChannel<T extends JsonValue>(name: string, schema?: schema.JsonSchema): Observable<T>;
342 │ 
343 │   /**
344 ▶    * Pings the job and wait for the resulting Pong before completing.
345 │    */
346 ▶   ping(): Observable<never>;
347 │ 
348 ▶   /**
349 ▶    * Stops the job from running. This is different than unsubscribing from the output as in it
350 │    * sends the JobInboundMessageKind.Stop raw input to the job.
351 │    */
352 ▶   stop(): void;
353 │ 
354 │   /**
355 │    * The JobInboundMessage messages TO the job.
356 │    */
357 ▶   readonly inboundBus: Observer<JobInboundMessage<InputT>>;
358 │ 
359 │   /**
360 │    * The JobOutboundMessage FROM the job.
361 │    */
362 ▶   readonly outboundBus: Observable<JobOutboundMessage<OutputT>>;
363 │ }
```

📄 `angular-cli/packages/angular_devkit/architect/src/jobs/README.md` L53–71 （▶ の行: 53, 59, 62–63）

```md
53 ▶ 1. `id`. A unique symbol that can be used as a Map key.
54 │ 1. `description`. The description of the job from the scheduler. See `JobDescription` object.
55 │ 1. `argument`. The argument value that was used to start the job.
56 │ 1. `input`. An `Observer` that can be used to send validated inputs to the job itself.
57 │ 1. `output`. An `Observable<OutputType>` that filters out messages to get only the returned output
58 │    of a job.
59 ▶ 1. `promise`. A promise that waits for the last output of a job. Returns the last value outputted
60 │    (or no value if there's no last value).
61 │ 1. `state`. The current state of the job (see `LifeCycle`).
62 ▶ 1. `channels`. A map of side channels the user can listen to as `Observable`.
63 ▶ 1. `ping()`. A function that can be used to ping the job, receiving a `Promise` for when the ping
64 │    is answered.
65 │ 1. `stop()`. Sends a `stop` input to the job, which suggests to stop the job. The job itself can
66 │    choose to ignore this message.
67 │ 1. `inboundBus`. The raw input `Observer<JobInboundMessage>`. This can be used to send messages to
68 │    the `context.inboundBus` observable in the job. These are `JobInboundMessage` messages. See
69 │    ["Communicating With Jobs"](#Communicating).
70 │ 1. `outboundBus`. The raw output `Observable<JobOutput>`. This can be used to listen to messages
71 │    from the job. See ["Communicating With Jobs"](#Communicating).
```

`schedule()` が返す `Job` の型（api.ts）と README の一覧は合っていません。README の 53 行目の `id`、59 行目の `promise`、62 行目の `channels` は `Job` にありません（チャンネルは 341 行目の `getChannel`）。63 行目は `ping()` が `Promise` を返すと言いますが、346 行目は `Observable<never>` です。この `ping()` は 6 節のとおり、`createJobHandler` の job では完了しませんでした。

## 2. registry に登録する

📄 `angular-cli/packages/angular_devkit/architect/src/jobs/simple-registry.ts` L67–95 （▶ の行: 68–70, 73–74, 79–80, 86, 91）

```ts
67 │   register<ArgumentT extends JsonValue, InputT extends JsonValue, OutputT extends JsonValue>(
68 ▶     nameOrHandler: JobName | JobHandler<ArgumentT, InputT, OutputT>,
69 ▶     handlerOrOptions: JobHandler<ArgumentT, InputT, OutputT> | RegisterJobOptions = {},
70 ▶     options: RegisterJobOptions = {},
71 │   ): void {
72 │     // Switch on the arguments.
73 ▶     if (typeof nameOrHandler == 'string') {
74 ▶       if (!isJobHandler(handlerOrOptions)) {
75 │         // This is an error.
76 │         throw new TypeError('Expected a JobHandler as second argument.');
77 │       }
78 │ 
79 ▶       this._register(nameOrHandler, handlerOrOptions, options);
80 ▶     } else if (isJobHandler(nameOrHandler)) {
81 │       if (typeof handlerOrOptions !== 'object') {
82 │         // This is an error.
83 │         throw new TypeError('Expected an object options as second argument.');
84 │       }
85 │ 
86 ▶       const name = options.name || nameOrHandler.jobDescription.name || handlerOrOptions.name;
87 │       if (name === undefined) {
88 │         throw new TypeError('Expected name to be a string.');
89 │       }
90 │ 
91 ▶       this._register(name, nameOrHandler, options);
92 │     } else {
93 │       throw new TypeError('Unrecognized arguments.');
94 │     }
95 │   }
```

📄 `angular-cli/packages/angular_devkit/architect/src/jobs/simple-registry.ts` L97–128 （▶ の行: 106, 108, 112–114, 117, 124, 127）

```ts
 97 │   protected _register<
 98 │     ArgumentT extends JsonValue,
 99 │     InputT extends JsonValue,
100 │     OutputT extends JsonValue,
101 │   >(
102 │     name: JobName,
103 │     handler: JobHandler<ArgumentT, InputT, OutputT>,
104 │     options: RegisterJobOptions,
105 │   ): void {
106 ▶     if (this._jobNames.has(name)) {
107 │       // We shouldn't allow conflicts.
108 ▶       throw new JobNameAlreadyRegisteredException(name);
109 │     }
110 │ 
111 │     // Merge all fields with the ones in the handler (to make sure we respect the handler).
112 ▶     const argument = schema.mergeSchemas(handler.jobDescription.argument, options.argument);
113 ▶     const input = schema.mergeSchemas(handler.jobDescription.input, options.input);
114 ▶     const output = schema.mergeSchemas(handler.jobDescription.output, options.output);
115 │ 
116 │     // Create the job description.
117 ▶     const jobDescription: JobDescription = {
118 │       name,
119 │       argument,
120 │       output,
121 │       input,
122 │     };
123 │ 
124 ▶     const jobHandler = Object.assign(handler.bind(undefined), {
125 │       jobDescription,
126 │     }) as unknown as JobHandler<MinimumArgumentValueT, MinimumInputValueT, MinimumOutputValueT>;
127 ▶     this._jobNames.set(name, jobHandler);
128 │   }
```

`register` には 2 つの形があります。`register('three', handler, options)` は 73〜79 行目で 3 つ目の `options` を `_register` に渡し、112〜114 行目で job の schema と options の schema を合わせます。もう 1 つの `register(handler, { name, ...options })` では、options は 2 つ目の引数 `handlerOrOptions` に入ります。86 行目は名前だけをそこから取りますが、91 行目が `_register` に渡すのは 3 つ目の `options`（既定の `{}`）です。記録の「register の 2 つの形」では、`(handler, { name: 'two', argument: { type: 'number' } })` の `description.argument` は `true`（何でも通す）で、`schedule('two', 'x')` は検査されずに `"x"` を返しました。`('three', handler, { argument })` の方は `JobArgumentSchemaValidationError` です。

📄 `angular-cli/packages/angular_devkit/architect/src/jobs/README.md` L91–110 （▶ の行: 92, 94, 101, 103–104, 109）

````md
 91 │ ```typescript
 92 ▶ import { jobs } from '@angular-devkit/core';
 93 │ 
 94 ▶ const add = jobs.createJobHandle<number[], number>((input) =>
 95 │   input.reduce((total, curr) => total + curr, 0),
 96 │ );
 97 │ 
 98 │ // Register the job in a SimpleJobRegistry. Different registries have different API.
 99 │ const registry = new jobs.SimpleJobRegistry();
100 │ const scheduler = new jobs.SimpleScheduler(registry);
101 ▶ registry.register(add, {
102 │   name: 'add',
103 ▶   input: { type: 'array', items: { type: 'number' } },
104 ▶   output: { type: 'number' },
105 │ });
106 │ 
107 │ scheduler
108 │   .schedule('add', [1, 2, 3, 4])
109 ▶   .promise.then((output) => console.log('1 + 2 + 3 + 4 is ' + output));
110 │ ```
````

README の最初の例は、ちょうどこの 2 つ目の形（101〜105 行目）で schema を渡していて、今の実装では `input` と `output` は効きません。ほかにも、92 行目の import 先は 2022-10 からは `@angular-devkit/architect`、94 行目の `createJobHandle` は `createJobHandler` の書き損じ、109 行目の `.promise` は 1 節のとおりありません。strategy\_spec.ts の memoize の it（244 行目）もこの形で `argument` と `output` を渡していますが、spec は schema の検査を確かめていないので通ります。91 行目の形は 2018-11 の a3a657f7e7 から変わっていません。

## 3. schedule：説明を作り、依存と pause を待つ

📄 `angular-cli/packages/angular_devkit/architect/src/jobs/simple-scheduler.ts` L140–177 （▶ の行: 140, 144–145, 148, 150, 152–154, 160, 163, 165, 175）

```ts
140 ▶     const handler = this._jobRegistry.get<MinimumArgumentT, MinimumInputT, MinimumOutputT>(name);
141 │ 
142 │     return handler.pipe(
143 │       switchMap((handler) => {
144 ▶         if (handler === null) {
145 ▶           return of(null);
146 │         }
147 │ 
148 ▶         const description: JobDescription = {
149 │           // Make a copy of it to be sure it's proper JSON.
150 ▶           ...(JSON.parse(JSON.stringify(handler.jobDescription)) as JobDescription),
151 │           name: handler.jobDescription.name || name,
152 ▶           argument: handler.jobDescription.argument || true,
153 ▶           input: handler.jobDescription.input || true,
154 ▶           output: handler.jobDescription.output || true,
155 │           channels: handler.jobDescription.channels || {},
156 │         };
157 │ 
158 │         const noopValidator = noopSchemaValidator();
159 │ 
160 ▶         const handlerWithExtra = Object.assign(handler.bind(undefined), {
161 │           jobDescription: description,
162 │           argumentV:
163 ▶             description.argument === true
164 │               ? noopValidator
165 ▶               : this._schemaRegistry.compile(description.argument),
166 │           inputV:
167 │             description.input === true
168 │               ? noopValidator
169 │               : this._schemaRegistry.compile(description.input),
170 │           outputV:
171 │             description.output === true
172 │               ? noopValidator
173 │               : this._schemaRegistry.compile(description.output),
174 │         }) as JobHandlerWithExtra;
175 ▶         this._internalJobDescriptionMap.set(name, handlerWithExtra);
176 │ 
177 │         return of(handlerWithExtra);
```

140 行目で registry に関数を聞き、148〜156 行目で説明を JSON の写しで作ります。schema が無ければ `true`（何でも通す）です。160〜174 行目で 3 つの schema を検査の関数にし（`true` なら検査しない関数）、175 行目で名前ごとに覚えます。

📄 `angular-cli/packages/angular_devkit/architect/src/jobs/simple-scheduler.ts` L212–249 （▶ の行: 214, 216–217, 219, 223, 241–243, 245, 248）

```ts
212 │   pause(): () => void {
213 │     let called = false;
214 ▶     this._pauseCounter++;
215 │ 
216 ▶     return () => {
217 ▶       if (!called) {
218 │         called = true;
219 ▶         if (--this._pauseCounter == 0) {
220 │           // Resume the queue.
221 │           const q = this._queue;
222 │           this._queue = [];
223 ▶           q.forEach((fn) => fn());
224 │         }
225 │       }
226 │     };
227 │   }
228 │ 
229 │   /**
230 │    * Schedule a job to be run, using its name.
231 │    * @param name The name of job to be run.
232 │    * @param argument The argument to send to the job when starting it.
233 │    * @param options Scheduling options.
234 │    * @returns The Job being run.
235 │    */
236 │   schedule<A extends MinimumArgumentT, I extends MinimumInputT, O extends MinimumOutputT>(
237 │     name: JobName,
238 │     argument: A,
239 │     options?: ScheduleJobOptions,
240 │   ): Job<A, I, O> {
241 ▶     if (this._pauseCounter > 0) {
242 ▶       const waitable = new Subject<never>();
243 ▶       this._queue.push(() => waitable.complete());
244 │ 
245 ▶       return this._scheduleJob<A, I, O>(name, argument, options || {}, waitable);
246 │     }
247 │ 
248 ▶     return this._scheduleJob<A, I, O>(name, argument, options || {}, EMPTY);
249 │   }
```

📄 `angular-cli/packages/angular_devkit/architect/src/jobs/simple-scheduler.ts` L505–527 （▶ の行: 506, 508–509, 511–512, 515, 518, 520, 524–525）

```ts
505 │     // Get handler first, since this can error out if there's no handler for the job name.
506 ▶     const handler = this._getInternalDescription(name);
507 │ 
508 ▶     const optionsDeps = (options && options.dependencies) || [];
509 ▶     const dependencies = Array.isArray(optionsDeps) ? optionsDeps : [optionsDeps];
510 │ 
511 ▶     const inboundBus = new Subject<JobInboundMessage<I>>();
512 ▶     const outboundBus = concat(
513 │       // Wait for dependencies, make sure to not report messages from dependencies. Subscribe to
514 │       // all dependencies at the same time so they run concurrently.
515 ▶       merge(...dependencies.map((x) => x.outboundBus)).pipe(ignoreElements()),
516 │ 
517 │       // Wait for pause() to clear (if necessary).
518 ▶       waitable,
519 │ 
520 ▶       from(handler).pipe(
521 │         switchMap(
522 │           (handler) =>
523 │             new Observable<JobOutboundMessage<O>>((subscriber: Observer<JobOutboundMessage<O>>) => {
524 ▶               if (!handler) {
525 ▶                 throw new JobDoesNotExistException(name);
526 │               }
527 │ 
```

📄 `angular-cli/packages/angular_devkit/architect/src/jobs/simple-scheduler.ts` L528–557 （▶ の行: 529, 531, 533–534, 537, 539, 541, 543–545, 548, 557）

```ts
528 │               // Validate the argument.
529 ▶               return from(handler.argumentV)
530 │                 .pipe(
531 ▶                   switchMap((validate) => validate(argument)),
532 │                   switchMap((output) => {
533 ▶                     if (!output.success) {
534 ▶                       throw new JobArgumentSchemaValidationError(output.errors);
535 │                     }
536 │ 
537 ▶                     const argument: A = output.data as A;
538 │                     const description = handler.jobDescription;
539 ▶                     subscriber.next({ kind: JobOutboundMessageKind.OnReady, description });
540 │ 
541 ▶                     const context = {
542 │                       description,
543 ▶                       dependencies: [...dependencies],
544 ▶                       inboundBus: inboundBus.asObservable(),
545 ▶                       scheduler: this as Scheduler<MinimumArgumentT, MinimumInputT, MinimumOutputT>,
546 │                     };
547 │ 
548 ▶                     return handler(argument, context);
549 │                   }),
550 │                 )
551 │                 .subscribe(subscriber as Observer<JobOutboundMessage<JsonValue>>);
552 │             }),
553 │         ),
554 │       ),
555 │     );
556 │ 
557 ▶     return this._createJob(name, argument, handler, inboundBus, outboundBus);
```

1. **512〜515 行目：依存の job が終わるのを待つ**

   依存の outboundBus をまとめて購読し、メッセージは捨てて完了だけを待ちます。記録の「dependencies と pause()」では、`after` の outboundBus だけを購読したのに `slow(A)` が走り、終わってから `after` の OnReady が出て、context の `dependencies` の state は `["ended"]` でした。
2. **518 行目：pause が解けるのを待つ**

   241〜246 行目、pause 中に schedule した job には、resume のときに完了する `Subject` を挟みます。記録では pause 中の C は `queued` のままで、`resume()` の後に OnReady から始まりました。
3. **529〜535 行目：引数を検査**

   合わなければ 534 行目の `JobArgumentSchemaValidationError`。記録は「Job Argument failed to validate. Errors: Data path "" must be number.」で、OnReady より前なので outboundBus には何も出ずに error、state は `errored` でした。無い名前は 525 行目の「Job name "nope" does not exist.」です。
4. **539・548 行目：OnReady を出してから関数を呼ぶ**

   OnReady は scheduler が出し、Start と End は関数（次の節の `createJobHandler`）が出します。

ここまでの全部が、返った `Job` の outboundBus か output を**誰かが購読するまで**動きません。記録の「1 回の job」では、`schedule` の直後も 20ms 後も state は `queued` で、購読して初めて OnReady → Start → fn → Output → End でした。README の 10 行目の「scheduled したら必ず 1 回走る」は、購読しなければ 1 回も走らないので、「購読したら 1 回」が実物です。

## 4. createJobHandler：普通の関数を job にする

📄 `angular-cli/packages/angular_devkit/architect/src/jobs/create-job-handler.ts` L72–92 （▶ の行: 76, 79, 81, 84–85, 87, 89–91）

```ts
72 │ export function createJobHandler<A extends JsonValue, I extends JsonValue, O extends JsonValue>(
73 │   fn: SimpleJobHandlerFn<A, I, O>,
74 │   options: Partial<JobDescription> = {},
75 │ ): JobHandler<A, I, O> {
76 ▶   const handler = (argument: A, context: JobHandlerContext<A, I, O>) => {
77 │     const description = context.description;
78 │     const inboundBus = context.inboundBus;
79 ▶     const inputChannel = new Subject<I>();
80 │     let subscription: Subscription;
81 ▶     const teardownLogics: Array<() => PromiseLike<void> | void> = [];
82 │     let tearingDown = false;
83 │ 
84 ▶     return new Observable<JobOutboundMessage<O>>((subject) => {
85 ▶       function complete() {
86 │         if (subscription) {
87 ▶           subscription.unsubscribe();
88 │         }
89 ▶         subject.next({ kind: JobOutboundMessageKind.End, description });
90 ▶         subject.complete();
91 ▶         inputChannel.complete();
92 │       }
```

📄 `angular-cli/packages/angular_devkit/architect/src/jobs/create-job-handler.ts` L94–120 （▶ の行: 95, 97–98, 101, 103–105, 110, 114–116）

```ts
 94 │       // Handle input.
 95 ▶       const inboundSub = inboundBus.subscribe((message) => {
 96 │         switch (message.kind) {
 97 ▶           case JobInboundMessageKind.Ping:
 98 ▶             subject.next({ kind: JobOutboundMessageKind.Pong, description, id: message.id });
 99 │             break;
100 │ 
101 ▶           case JobInboundMessageKind.Stop:
102 │             // Run teardown logic then complete.
103 ▶             tearingDown = true;
104 ▶             if (teardownLogics.length) {
105 ▶               Promise.all(teardownLogics.map((fn) => fn())).then(
106 │                 () => complete(),
107 │                 () => complete(),
108 │               );
109 │             } else {
110 ▶               complete();
111 │             }
112 │             break;
113 │ 
114 ▶           case JobInboundMessageKind.Input:
115 ▶             if (!tearingDown) {
116 ▶               inputChannel.next(message.value);
117 │             }
118 │             break;
119 │         }
120 │       });
```

📄 `angular-cli/packages/angular_devkit/architect/src/jobs/create-job-handler.ts` L164–187 （▶ の行: 166–167, 169–172, 175–178, 180, 186）

```ts
164 │       };
165 │ 
166 ▶       subject.next({ kind: JobOutboundMessageKind.Start, description });
167 ▶       let result = fn(argument, newContext);
168 │       // If the result is a promise, simply wait for it to complete before reporting the result.
169 ▶       if (isPromise(result)) {
170 ▶         result = from(result);
171 ▶       } else if (!isObservable(result)) {
172 ▶         result = of(result);
173 │       }
174 │ 
175 ▶       subscription = result.subscribe(
176 ▶         (value: O) => subject.next({ kind: JobOutboundMessageKind.Output, description, value }),
177 ▶         (error) => subject.error(error),
178 ▶         () => complete(),
179 │       );
180 ▶       subscription.add(inboundSub);
181 │ 
182 │       return subscription;
183 │     });
184 │   };
185 │ 
186 ▶   return Object.assign(handler, { jobDescription: options });
187 │ }
```

1. **166〜167 行目：Start を出してから関数を呼ぶ**

   記録の「1 回の job」の 6 番が Start、7 番が fn です。
2. **169〜173 行目：Promise も値も Observable にそろえる**

   返った値ごとに 176 行目で Output、完了で 85〜92 行目の `complete()` が End を出します。177 行目、例外のときは End を出さずに error です。
3. **95〜120 行目：入ってくるメッセージ**

   Ping には 98 行目で**その場で** Pong を返し、Stop は 104〜108 行目で `addTeardown` の関数を全部待ってから `complete()`、Input は 116 行目で `context.input` に流します。記録の「input・ping・stop」では `job.stop()` の後に「addTeardown の関数が呼ばれた」→ End でした。

101〜112 行目の teardown は 48871381a1（2023-04、`allow registered builder teardowns to execute`）が足しました。それまでは Stop で即 `complete()` していて、builder の後片付けが走る前に job が終わっていました。`createBuilder` が `addTeardown` を使う所は[次の回](10-dvk-architect.md)です。

## 5. メッセージを通す門：state と検査

📄 `angular-cli/packages/angular_devkit/architect/src/jobs/simple-scheduler.ts` L255–290 （▶ の行: 259–261, 263, 266, 269, 282, 284, 286）

```ts
255 │   private _filterJobOutboundMessages<O extends MinimumOutputT>(
256 │     message: JobOutboundMessage<O>,
257 │     state: JobState,
258 │   ) {
259 ▶     switch (message.kind) {
260 ▶       case JobOutboundMessageKind.OnReady:
261 ▶         return state == JobState.Queued;
262 │       case JobOutboundMessageKind.Start:
263 ▶         return state == JobState.Ready;
264 │ 
265 │       case JobOutboundMessageKind.End:
266 ▶         return state == JobState.Started || state == JobState.Ready;
267 │     }
268 │ 
269 ▶     return true;
270 │   }
271 │ 
272 │   /**
273 │    * Return a new state. This is just to simplify the reading of the _createJob method.
274 │    * @private
275 │    */
276 │   private _updateState<O extends MinimumOutputT>(
277 │     message: JobOutboundMessage<O>,
278 │     state: JobState,
279 │   ): JobState {
280 │     switch (message.kind) {
281 │       case JobOutboundMessageKind.OnReady:
282 ▶         return JobState.Ready;
283 │       case JobOutboundMessageKind.Start:
284 ▶         return JobState.Started;
285 │       case JobOutboundMessageKind.End:
286 ▶         return JobState.Ended;
287 │     }
288 │ 
289 │     return state;
290 │   }
```

job の関数が返したメッセージは、ここで今の state に合うものだけが通ります。OnReady は Queued のとき（261 行目）、Start は Ready のとき（263 行目）、End は Started か Ready のとき（266 行目）だけです。2 回目の Start や End は落ちます。

📄 `angular-cli/packages/angular_devkit/architect/src/jobs/simple-scheduler.ts` L47–61 （▶ の行: 47, 49, 52, 54, 57, 59）

```ts
47 ▶ export class JobArgumentSchemaValidationError extends schema.SchemaValidationException {
48 │   constructor(errors?: schema.SchemaValidatorError[]) {
49 ▶     super(errors, 'Job Argument failed to validate. Errors: ');
50 │   }
51 │ }
52 ▶ export class JobInboundMessageSchemaValidationError extends schema.SchemaValidationException {
53 │   constructor(errors?: schema.SchemaValidatorError[]) {
54 ▶     super(errors, 'Job Inbound Message failed to validate. Errors: ');
55 │   }
56 │ }
57 ▶ export class JobOutputSchemaValidationError extends schema.SchemaValidationException {
58 │   constructor(errors?: schema.SchemaValidatorError[]) {
59 ▶     super(errors, 'Job Output failed to validate. Errors: ');
60 │   }
61 │ }
```

📄 `angular-cli/packages/angular_devkit/architect/src/jobs/simple-scheduler.ts` L312–350 （▶ の行: 313, 318, 323, 325, 329–330, 332, 334, 336, 338, 342）

```ts
312 │     // Create the input channel by having a filter.
313 ▶     const input = new Subject<JsonValue>();
314 │     input
315 │       .pipe(
316 │         concatMap((message) =>
317 │           handler.pipe(
318 ▶             switchMap(async (handler) => {
319 │               if (handler === null) {
320 │                 throw new JobDoesNotExistException(name);
321 │               }
322 │ 
323 ▶               const validator = await handler.inputV;
324 │ 
325 ▶               return validator(message);
326 │             }),
327 │           ),
328 │         ),
329 ▶         filter((result) => result.success),
330 ▶         map((result) => result.data as I),
331 │       )
332 ▶       .subscribe((value) => inboundBus.next({ kind: JobInboundMessageKind.Input, value }));
333 │ 
334 ▶     outboundBus = concat(
335 │       outboundBus,
336 ▶       // Add an End message at completion. This will be filtered out if the job actually send an
337 │       // End.
338 ▶       handler.pipe(
339 │         switchMap((handler) => {
340 │           if (handler) {
341 │             return of<JobOutboundMessage<O>>({
342 ▶               kind: JobOutboundMessageKind.End,
343 │               description: handler.jobDescription,
344 │             });
345 │           } else {
346 │             return EMPTY as Observable<JobOutboundMessage<O>>;
347 │           }
348 │         }),
349 │       ),
350 │     ).pipe(
```

`job.input.next(値)` は 323 行目で input の schema に通し、329 行目で**合わないものを黙って捨てます**。記録で input の schema を number にして 1・`"2"`・3 を送ると、job に届いたのは 1 と 3 だけで、例外もメッセージもありませんでした（52〜56 行目に `JobInboundMessageSchemaValidationError` という例外のクラスがありますが、どこからも投げられていません。47〜51 行目の引数の例外と 57〜61 行目の出力の例外は、3 節の 534 行目と、下の 417 行目で投げます）。334〜350 行目、関数のメッセージの後に scheduler が End を 1 つ足し、関数がもう End を出していれば 266 行目で落とします。

📄 `angular-cli/packages/angular_devkit/architect/src/jobs/simple-scheduler.ts` L402–434 （▶ の行: 402–403, 405, 414–417, 420–422, 427, 431–433）

```ts
402 ▶       // Do output validation (might include default values so this might have side
403 ▶       // effects). We keep all messages in order.
404 │       concatMap((message) => {
405 ▶         if (message.kind !== JobOutboundMessageKind.Output) {
406 │           return of(message);
407 │         }
408 │ 
409 │         return handler.pipe(
410 │           switchMap(async (handler) => {
411 │             if (handler === null) {
412 │               throw new JobDoesNotExistException(name);
413 │             }
414 ▶             const validate = await handler.outputV;
415 ▶             const output = await validate(message.value);
416 ▶             if (!output.success) {
417 ▶               throw new JobOutputSchemaValidationError(output.errors);
418 │             }
419 │ 
420 ▶             return {
421 ▶               ...message,
422 ▶               output: output.data as O,
423 │             } as JobOutboundMessageOutput<O>;
424 │           }),
425 │         ) as Observable<JobOutboundMessage<O>>;
426 │       }),
427 ▶       _jobShare(),
428 │     );
429 │ 
430 │     const output = outboundBus.pipe(
431 ▶       filter((x) => x.kind == JobOutboundMessageKind.Output),
432 ▶       map((x) => x.value),
433 ▶       shareReplay(1),
434 │     );
```

Output は 414〜418 行目で output の schema に通し、420〜423 行目で検査の後の値を `output` という**別のフィールド**に入れます。一方 430〜434 行目の `job.output` が返すのは元の `value` です。402〜403 行目のコメントは「既定値が入るかもしれない」と言いますが、記録で output の schema に `default: 1` を書いて `{}` を返すと、`value` も `output` も `{}`、`job.output` も `{}` でした（scheduler の既定の登録簿は default を入れる変換を持たない。[第 3 回](03-dvk-schema.md)）。

## 6. 購読を外す・ping・stop

📄 `angular-cli/packages/angular_devkit/architect/src/jobs/simple-scheduler.ts` L74–112 （▶ の行: 74, 83–85, 88, 101–102, 105–106, 108–109）

```ts
 74 ▶   return (source: Observable<T>): Observable<T> => {
 75 │     let refCount = 0;
 76 │     let subject: Subject<T>;
 77 │     let hasError = false;
 78 │     let isComplete = false;
 79 │     let subscription: Subscription;
 80 │ 
 81 │     return new Observable<T>((subscriber) => {
 82 │       let innerSub: Subscription;
 83 ▶       refCount++;
 84 ▶       if (!subject) {
 85 ▶         subject = new Subject<T>();
 86 │ 
 87 │         innerSub = subject.subscribe(subscriber);
 88 ▶         subscription = source.subscribe({
 89 │           next(value) {
 90 │             subject.next(value);
 91 │           },
 92 │           error(err) {
 93 │             hasError = true;
 94 │             subject.error(err);
 95 │           },
 96 │           complete() {
 97 │             isComplete = true;
 98 │             subject.complete();
 99 │           },
100 │         });
101 ▶       } else {
102 ▶         innerSub = subject.subscribe(subscriber);
103 │       }
104 │ 
105 ▶       return () => {
106 ▶         refCount--;
107 │         innerSub.unsubscribe();
108 ▶         if (subscription && refCount === 0 && (isComplete || hasError)) {
109 ▶           subscription.unsubscribe();
110 │         }
111 │       };
112 │     });
```

outboundBus は 427 行目でこの `_jobShare` を通ります。2 人目からは 102 行目で同じ `Subject` に加わるだけで、それまでのメッセージは流れません（README の 11 行目「今いる所から」のとおり）。105〜111 行目、購読が 0 人になっても、job が終わっていなければ（`isComplete` か `hasError` でなければ）元の購読を外しません。

📄 `angular-cli/packages/angular_devkit/architect/src/jobs/simple-scheduler.ts` L476–492 （▶ の行: 477–478, 480–482, 486–487）

```ts
476 │       ping() {
477 ▶         const id = pingId++;
478 ▶         inboundBus.next({ kind: JobInboundMessageKind.Ping, id });
479 │ 
480 ▶         return outboundBus.pipe(
481 ▶           filter((x) => x.kind === JobOutboundMessageKind.Pong && x.id == id),
482 ▶           first(),
483 │           ignoreElements(),
484 │         );
485 │       },
486 ▶       stop() {
487 ▶         inboundBus.next({ kind: JobInboundMessageKind.Stop });
488 │       },
489 │       input,
490 │       inboundBus,
491 │       outboundBus,
492 │     };
```

📄 `angular-cli/packages/angular_devkit/architect/src/jobs/README.md` L224–236 （▶ の行: 224–225, 227–229）

```md
224 ▶ 1. `JobInboundMessageKind.Ping`. A simple message that should be answered with
225 ▶    `JobOutboundMessageKind.Pong` when the job is responsive. The `id` field of the message should
226 │    be used when returning `Pong`.
227 ▶ 1. `JobInboundMessageKind.Stop`. The job should be stopped. This is used when
228 ▶    cancelling/unsubscribing from the `output` (or by calling `stop()`). Any inputs or outputs
229 ▶    after this message will be ignored.
230 │ 1. `JobInboundMessageKind.Input` is used when sending inputs to a job. These correspond to the
231 │    `next` methods of an `Observer` and are reported to the job through its `context.input`
232 │    Observable. There is no way to communicate an error to the job.
233 │ 
234 │ Using the `createJobHandler()` helper, all those messages are automatically handled by the
235 │ boilerplate code. If you need direct access to raw inputs, you should subscribe to the
236 │ `context.inboundBus` Observable.
```

| 記録 | 結果 | 理由 |
| --- | --- | --- |
| `job.output` を購読し、3 つ出たところで外す | 30ms 後も出力は増え続け（3 → 8）、job の teardown は呼ばれず、state は `started` | 433 行目の `shareReplay(1)` は購読が 0 人でも元を外さず、108 行目も終わるまで外さない。Stop は送られない |
| その後 `job.stop()` | teardown が呼ばれ、state は `ended` | 487 行目で Stop を送り、4 節の 101〜112 行目 |
| `job.ping()` を呼んで購読 | outboundBus に Pong（`id: 0`）は出たが、50ms 待っても ping の Observable は完了しない。`stop()` の後に `EmptyError` | 478 行目で Ping を**先に**送り、4 節の 98 行目が同期で Pong を返すので、480 行目の購読が始まる前に Pong が流れ終わる |

README の 227〜229 行目は「Stop は output の購読を外したときにも使われる」と言いますが、api.ts の 348〜351 行目の JSDoc は「stop は購読を外すのとは違う」で、記録は JSDoc のとおりでした。simple-scheduler\_spec.ts の `can be cancelled by unsubscribing from the raw output`（318 行目）も、購読を外した後に `job.stop()` を呼んでから終わりを確かめています。`ping()` は src の中で呼ぶ所がなく、spec もありません。main も同じです。

## 7. strategy：同時に呼んだときの回数

📄 `angular-cli/packages/angular_devkit/architect/src/jobs/strategy.ts` L39–64 （▶ の行: 47, 51–55, 61）

```ts
39 │ /**
40 │  * Creates a JobStrategy that serializes every call. This strategy can be mixed between jobs.
41 │  */
42 │ export function serialize<
43 │   A extends JsonValue = JsonValue,
44 │   I extends JsonValue = JsonValue,
45 │   O extends JsonValue = JsonValue,
46 │ >(): JobStrategy<A, I, O> {
47 ▶   let latest: Observable<JobOutboundMessage<O>> = of();
48 │ 
49 │   return (handler, options) => {
50 │     const newHandler = (argument: A, context: JobHandlerContext<A, I, O>) => {
51 ▶       const previous = latest;
52 ▶       latest = concat(
53 ▶         previous.pipe(ignoreElements()),
54 ▶         new Observable<JobOutboundMessage<O>>((o) => handler(argument, context).subscribe(o)),
55 ▶       ).pipe(shareReplay(0));
56 │ 
57 │       return latest;
58 │     };
59 │ 
60 │     return Object.assign(newHandler, {
61 ▶       jobDescription: Object.assign({}, handler.jobDescription, options),
62 │     });
63 │   };
64 │ }
```

📄 `angular-cli/packages/angular_devkit/architect/src/jobs/strategy.ts` L66–91 （▶ の行: 67, 76–78, 83, 85–86, 88–89）

```ts
66 │ /**
67 ▶  * Creates a JobStrategy that will always reuse a running job, and restart it if the job ended.
68 │  * @param replayMessages Replay ALL messages if a job is reused, otherwise just hook up where it
69 │  * is.
70 │  */
71 │ export function reuse<
72 │   A extends JsonValue = JsonValue,
73 │   I extends JsonValue = JsonValue,
74 │   O extends JsonValue = JsonValue,
75 │ >(replayMessages = false): JobStrategy<A, I, O> {
76 ▶   let inboundBus = new Subject<JobInboundMessage<I>>();
77 ▶   let run: Observable<JobOutboundMessage<O>> | null = null;
78 ▶   let state: JobOutboundMessage<O> | null = null;
79 │ 
80 │   return (handler, options) => {
81 │     const newHandler = (argument: A, context: JobHandlerContext<A, I, O>) => {
82 │       // Forward inputs.
83 ▶       const subscription = context.inboundBus.subscribe(inboundBus);
84 │ 
85 ▶       if (run) {
86 ▶         return concat(
87 │           // Update state.
88 ▶           of(state),
89 ▶           run,
90 │         ).pipe(finalize(() => subscription.unsubscribe()));
91 │       }
```

📄 `angular-cli/packages/angular_devkit/architect/src/jobs/strategy.ts` L93–118 （▶ の行: 93, 96, 101, 105, 107–108, 111, 117）

```ts
 93 ▶       run = handler(argument, { ...context, inboundBus: inboundBus.asObservable() }).pipe(
 94 │         tap(
 95 │           (message) => {
 96 ▶             if (
 97 │               message.kind == JobOutboundMessageKind.Start ||
 98 │               message.kind == JobOutboundMessageKind.OnReady ||
 99 │               message.kind == JobOutboundMessageKind.End
100 │             ) {
101 ▶               state = message;
102 │             }
103 │           },
104 │           undefined,
105 ▶           () => {
106 │             subscription.unsubscribe();
107 ▶             inboundBus = new Subject<JobInboundMessage<I>>();
108 ▶             run = null;
109 │           },
110 │         ),
111 ▶         replayMessages ? shareReplay() : share(),
112 │       );
113 │ 
114 │       return run;
115 │     };
116 │ 
117 ▶     return Object.assign(newHandler, handler, options || {});
118 │   };
```

📄 `angular-cli/packages/angular_devkit/architect/src/jobs/strategy.ts` L121–159 （▶ の行: 131, 135–138, 146, 148–149, 152–153, 158）

```ts
121 │ /**
122 │  * Creates a JobStrategy that will reuse a running job if the argument matches.
123 │  * @param replayMessages Replay ALL messages if a job is reused, otherwise just hook up where it
124 │  * is.
125 │  */
126 │ export function memoize<
127 │   A extends JsonValue = JsonValue,
128 │   I extends JsonValue = JsonValue,
129 │   O extends JsonValue = JsonValue,
130 │ >(replayMessages = false): JobStrategy<A, I, O> {
131 ▶   const runs = new Map<string, Observable<JobOutboundMessage<O>>>();
132 │ 
133 │   return (handler, options) => {
134 │     const newHandler = (argument: A, context: JobHandlerContext<A, I, O>) => {
135 ▶       const argumentJson = JSON.stringify(
136 ▶         isJsonObject(argument)
137 ▶           ? Object.keys(argument)
138 ▶               .sort()
139 │               .reduce((result, key) => {
140 │                 result[key] = argument[key];
141 │ 
142 │                 return result;
143 │               }, {} as JsonObject)
144 │           : argument,
145 │       );
146 ▶       const maybeJob = runs.get(argumentJson);
147 │ 
148 ▶       if (maybeJob) {
149 ▶         return maybeJob;
150 │       }
151 │ 
152 ▶       const run = handler(argument, context).pipe(replayMessages ? shareReplay() : share());
153 ▶       runs.set(argumentJson, run);
154 │ 
155 │       return run;
156 │     };
157 │ 
158 ▶     return Object.assign(newHandler, handler, options || {});
159 │   };
```

記録の「strategy ごとの呼び出しの回数」は、30ms かかる job を `a`・`a`・`b` の 3 つ同時に schedule し、全部が終わった後にもう一度 `a` を schedule したものです（出力の `#n` は何回目の呼び出しか）。

| strategy | 同時の 3 つの出力 | 関数の呼び出し | 終わった後の `a` | 行 |
| --- | --- | --- | --- | --- |
| なし | `a#1, a#2, b#3` | 3 回（同時に 0ms で開始） | `a#4` | — |
| `serialize()` | `a#1, a#2, b#3` | 3 回（0・30・60ms に 1 つずつ） | `a#4` | 52〜55 行目：前の run の完了を待ってから次 |
| `reuse()` | `a#1, a#1, a#1` | 1 回（`b` も相乗り） | `a#2` | 85〜91 行目：走っている run があれば引数を見ずに返す。105〜109 行目で終わったら捨てる |
| `memoize()` | `a#1, a#1, b#2` | 2 回 | `a#3`（もう一度走る） | 135〜149 行目：引数の JSON で引く。152 行目の `share()` は終わると次の購読で関数の Observable を作り直す |

`memoize` の鍵は 136〜144 行目で**一番上のキーだけ**を並べ替えた JSON なので、入れ子のオブジェクトはキーの順が違うと別の引数です。終わった後も結果を残したいときは `memoize(true)`（152 行目の `shareReplay()`）です。もう 1 つ、strategy に 2 つ目の引数（説明の上書き）を渡すと、`serialize` は 61 行目で `jobDescription` に混ぜますが、`reuse` の 117 行目と `memoize` の 158 行目は関数そのものに `Object.assign` します。記録の「strategy に options を渡す」では `{ name: 'x', argument }` を渡すと、2 つとも「TypeError: Cannot assign to read only property 'name' of function …」でした（関数の `name` は書き換えられない）。`name` を渡さなくても、`argument` は関数のプロパティになるだけで説明には入りません。

📄 `angular-cli/packages/angular_devkit/architect/src/jobs/README.md` L283–302 （▶ の行: 290, 292, 297, 300–302）

````md
283 │ declare const registry: jobs.SimpleJobRegistry;
284 │ registry.register(dispatcher);
285 │ registry.register(npmInstall);
286 │ registry.register(yarnInstall);
287 │ registry.register(pnpmInstall);
288 │ 
289 │ // Default to npm.
290 ▶ dispatcher.setDefaultDelegate(npmInstall.name);
291 │ // If the user is asking for yarn over npm, uses it.
292 ▶ dispatcher.addConditionalDelegate(() => userWantsYarn, yarnInstall.name);
293 │ ```
294 │ 
295 │ ## Execution Strategy
296 │ 
297 ▶ Jobs are always run in parallel and will always start, but many helper functions are provided
298 │ when creating a job to help you control the execution strategy;
299 │ 
300 ▶ 1. `serialize()`. Multiple runs of this job will be queued with each others.
301 ▶ 1. `memoize(replayMessages = false)` will create a job, or reuse the same job when inputs are
302 ▶    matching. If the inputs don't match, a new job will be started and its outputs will be stored.
````

📄 `angular-cli/packages/angular_devkit/architect/src/jobs/dispatcher.ts` L46–80 （▶ の行: 48, 52, 54, 56, 59, 61, 69, 76）

```ts
46 │   const job: JobHandler<JsonValue, JsonValue, JsonValue> = Object.assign(
47 │     (argument: JsonValue, context: JobHandlerContext) => {
48 ▶       const maybeDelegate = conditionalDelegateList.find(([predicate]) => predicate(argument));
49 │       let delegate: Job<JsonValue, JsonValue, JsonValue>;
50 │ 
51 │       if (maybeDelegate) {
52 ▶         delegate = context.scheduler.schedule(maybeDelegate[1], argument);
53 │       } else if (defaultDelegate) {
54 ▶         delegate = context.scheduler.schedule(defaultDelegate, argument);
55 │       } else {
56 ▶         throw new JobDoesNotExistException('<null>');
57 │       }
58 │ 
59 ▶       context.inboundBus.subscribe(delegate.inboundBus);
60 │ 
61 ▶       return delegate.outboundBus;
62 │     },
63 │     {
64 │       jobDescription: options,
65 │     },
66 │   );
67 │ 
68 │   return Object.assign(job, {
69 ▶     setDefaultJob(name: JobName | null | JobHandler<JsonValue, JsonValue, JsonValue>) {
70 │       if (isJobHandler(name)) {
71 │         name = name.jobDescription.name === undefined ? null : name.jobDescription.name;
72 │       }
73 │ 
74 │       defaultDelegate = name;
75 │     },
76 ▶     addConditionalJob(predicate: (args: JsonValue) => boolean, name: JobName) {
77 │       conditionalDelegateList.push([predicate, name]);
78 │     },
79 │     // TODO: Remove return-only generic from createDispatcher() API.
80 │   }) as unknown as JobDispatcher<A, I, O>;
```

README の 300〜302 行目の strategy の一覧に `reuse()` はありません。290・292 行目の `setDefaultDelegate`・`addConditionalDelegate` は、実物では 69 行目の `setDefaultJob` と 76 行目の `addConditionalJob` です。dispatcher は 48 行目で最初に条件の合う job を選び、52 行目で同じ scheduler に schedule し、61 行目でその outboundBus をそのまま返します。

> **🧪 DEMO — jobs を Node で直接動かした記録**
>
> ボタンは、`SimpleJobRegistry` と `SimpleScheduler` を作り、`createJobHandler` の job を登録して動かした記録を再生します。`outboundBus` の行は購読した outboundBus のメッセージ（`description` は省いた）と、そのときの `job.state`、`fn` は job の関数の中で書き留めたものです。
>
> ボタンを押すと記録が出ます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/dvk-jobs)

## ここまでの呼び出し（1 回の job）

- 👤 `registry.register('add', createJobHandler(fn))` — simple-registry.ts L67 → L97
- 👤 `scheduler.schedule('add', [1, 2, 3])` — simple-scheduler.ts L236 — *まだ何も走らない*
  - `_scheduleJob` → `_getInternalDescription` — L505・L140
  - `_createJob(name, argument, handler, inboundBus, outboundBus)` — L557 → L313・L334・L427 — *input の検査・End の追加・\_jobShare*
- 👤 `job.outboundBus.subscribe(…)` — L427 の \_jobShare — *ここで初めて動く*
  - `dependencies` の完了 → `waitable` → 引数の検査 — L515・L518・L531
  - `OnReady` → `handler(argument, context)` — L539・L548
    - `Start` → `fn(argument, newContext)` — create-job-handler.ts L166・L167
    - `Output` → `complete()` → `End` — L176・L85
  - `_filterJobOutboundMessages`・`_updateState`・output の検査 — simple-scheduler.ts L255・L276・L404

## テストと直し方

| ファイル | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `src/jobs/simple-scheduler_spec.ts` | `SimpleScheduler`（23）› `works for a simple case`（32）・`validates arguments`（89）・`validates outputs`（105）・`works with dependencies`（119）・`can be paused`（244）・`can be cancelled by unsubscribing from the raw output`（318）・`lifecycle messages`（503）› `add an End if there is not one`（526）・`input`（561）› `validates`（592）ほか、全 19 | 3・5 節。`input › validates` は `"2"` が捨てられることを確かめている。`ping()` の it は無い |
| `src/jobs/strategy_spec.ts` | `strategy.serialize()`（18）› `works`（27）・`works across jobs`（82）、`strategy.reuse()`（160）› `works`（169）、`strategy.memoize()`（235）› `works`（244） | 7 節の回数。strategy に options を渡す it と、終わった後の memoize の it は無い |
| `src/jobs/simple-registry_spec.ts`・`dispatcher_spec.ts` | `SimpleJobRegistry`（13）› `works for a simple case`（20）、`createDispatcher`（17）› `works`（18） | 2 節の 1 つ目の形だけ |
| `node/jobs/job-registry_spec.ts` | `NodeModuleJobScheduler`（16）› `works`（17） | 名前 `module#export` で読む registry |

📄 `走らせたコマンド（2026-11-26）`

```
$ cd ~/angular-research/angular-cli      # 44129f66a3、読むだけ
$ pnpm bazel test //packages/angular_devkit/architect:test --nocache_test_results --test_output=all
（結果は下の段落）
```

手元の bazel で `architect:test` は 68 specs・0 failures（jobs の spec に加え、`src/index_spec.ts` などの Architect の spec を含む）、`architect/node:test` は 1 spec・0 failures でした。

直すとしたら、2 節は `simple-registry.ts` の 91 行目で `handlerOrOptions` と `options` を合わせて渡し、simple-registry\_spec.ts に「`register(handler, { name, argument })` の argument で検査される」を足します。6 節の ping は 476〜485 行目を、先に outboundBus の Pong を待つ Observable を作り、その購読の中で Ping を送る形（`defer`）に変えます。7 節は `strategy.ts` の 117 行目と 158 行目を、`serialize` の 60〜62 行目と同じ `jobDescription: Object.assign({}, handler.jobDescription, options)` にします。どれも strategy\_spec.ts・simple-scheduler\_spec.ts に 1 つずつ it を足して固められます。

## 聞かれそうな質問

**Q. schedule したのに job の関数が呼ばれません。**

outboundBus か output を誰も購読していないからです。outboundBus は 512〜555 行目で `concat` を組んだだけの Observable で、427 行目の `_jobShare` を最初に購読したときに元が購読されます。記録では購読まで state は `queued` でした。

**Q. input に schema に合わない値を送ったらエラーになりますか？**

なりません。329 行目で黙って捨てます。記録は `"2"` が届かず、例外もメッセージもありませんでした。

**Q. output の購読を外せば job は止まりますか？**

止まりません。433 行目の `shareReplay(1)` と 108 行目が元の購読を外さず、Stop も送らないからです。止めるのは `job.stop()`（487 行目）で、`createJobHandler` はそこで teardown を待ってから End を出します。

**Q. serialize・reuse・memoize の違いは？**

serialize は 1 つずつ順に（3 回呼ぶ）、reuse は走っている間は引数を見ずに相乗り（1 回）、memoize は同じ引数だけ相乗り（2 回）です。終わった後に呼ぶと 3 つとも新しく走りました（7 節の表）。

**Q. README の `register(add, { name, input, output })` の書き方でよいですか？**

名前は付きますが、schema は効きません。91 行目が 3 つ目の引数（空）を渡すからです。schema を効かせるなら `register('add', add, { input, output })` の形にします。

## 読み終えて

- job は「関数 + 説明」で、メッセージの Observable を返す。outboundBus は OnReady → Start → Output → End。OnReady は scheduler、Start と End は `createJobHandler` が出す。
- job は購読されるまで動かない。依存の完了・pause・引数の検査を待ってから関数を呼ぶ。
- input の検査に落ちた値は黙って捨てられ、output の検査の結果は `job.output` に使われない。購読を外しても止まらず、止めるのは `stop()`。`ping()` は `createJobHandler` の job では完了しない。
- serialize は順に、reuse は引数を見ずに相乗り、memoize は引数ごとに相乗り。`reuse`・`memoize` に名前を渡すと TypeError。
- README は 2018 年の形のまま、import 先・`promise`・`id`・dispatcher の名前・register の形が実物と違う。

---

← 前: [ワークフローと engine host：sink・workflow・tools・tasks](08-dvk-workflow.md)  
次: [Architect が builder を呼ぶまで：options・context・progress・結果](10-dvk-architect.md) →
