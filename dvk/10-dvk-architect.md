[目次](../README.md) › [@angular-devkit の内側](README.md) › 第 10 回 / 全 12 回

# Architect が builder を呼ぶまで：options・context・progress・結果

> architect/src/architect.ts・api.ts・create-builder.ts・schedule-by-name.ts・options.ts・node/node-modules-architect-host.ts：options の重ね方（configuration は浅く、overrides は 1 段深く）、scheduleTarget と scheduleBuilder、builder の job のキャッシュ、BuilderContext の中身、progress と結果の流れ、builder が失敗・例外を投げたときの result。

angular/angular-cli · 読了 約 13 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/dvk-architect)

---

この章で分かること：`Architect` が builder（`ng build` などの中身の関数）を呼ぶとき、`angular.json` の `options`・`configurations`・コマンドラインの上書き（overrides）をどの順にどう重ねるか、builder に渡る `BuilderContext` の中身、progress（進み具合の報告）と結果がどう流れるか、builder が失敗したり例外を投げたりしたとき呼んだ側に何が返るかです。`scheduleTarget` と `scheduleBuilder` の違いも見ます。

読む対象は `packages/angular_devkit/architect/` の `src/architect.ts`・`src/api.ts`・`src/create-builder.ts`・`src/schedule-by-name.ts`・`src/options.ts`・`src/internal.ts`・`node/node-modules-architect-host.ts` です（../angular-cli、44129f66a3）。`"builder": "@angular/build:dev-server"` の文字列から `import()` までの道（`resolveBuilder`・`loadBuilder`・`ArchitectTargetJobRegistry`・`scheduleByName` の前半・`createBuilder` の 204〜217 行目）は[builder を探し出す章](../boot/02-boot-architect.md)が読んでいて、ここはその残りです。その下の jobs は[前の回](09-dvk-jobs.md)です。

1. [1. パスと文字列](01-dvk-path.md)
2. [2. 仮想ファイルシステムの host](02-dvk-host.md)
3. [3. JSON schema の検査](03-dvk-schema.md)
4. [4. angular.json の読み書き](04-dvk-workspace.md)
5. [5. logger と小さな道具](05-dvk-logger.md)
6. [6. Tree](06-dvk-tree.md)
7. [7. エンジンと規則](07-dvk-engine.md)
8. [8. ワークフローと engine host](08-dvk-workflow.md)
9. [9. architect の jobs](09-dvk-jobs.md)
10. **10. Architect が builder を呼ぶまで**（この章）
11. [11. テストの道具](11-dvk-testing.md)
12. [12. spec と issue](12-dvk-tests-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> DEMO の記録は、ローカルの `@angular/cli` 22.2.7 が持つ `@angular-devkit/architect` 0.2202.7 を Node から直接使って取りました。記録用のワークスペースに `angular.json`（プロジェクト `app` と 4 つの target）と、`node_modules/demo-builders`（`builders.json` に自作の builder を 10 個）を置き、`readWorkspace`（[第 4 回](04-dvk-workspace.md)）で読んだ workspace から `WorkspaceNodeModulesArchitectHost` を作っています。登録簿には CLI と同じく `addUndefinedDefaults` を足しました。`src/` と `node/` は 44129f66a3 と v22.2.7 で同じです（違うのは `bin/architect.ts` だけ）。

## 1. host の約束：Architect が workspace に聞くこと

📄 `angular-cli/packages/angular_devkit/architect/src/internal.ts` L63–87 （▶ の行: 63, 68, 71–72, 77–78, 80–81, 83, 85–86）

```ts
63 ▶ export interface ArchitectHost<BuilderInfoT extends BuilderInfo = BuilderInfo> {
64 │   /**
65 │    * Get the builder name for a target.
66 │    * @param target The target to inspect.
67 │    */
68 ▶   getBuilderNameForTarget(target: Target): Promise<string | null>;
69 │ 
70 │   /**
71 ▶    * Resolve a builder. This needs to return a string which will be used in a dynamic `import()`
72 ▶    * clause. This should throw if no builder can be found. The dynamic import will throw if
73 │    * it is unsupported.
74 │    * @param builderName The name of the builder to be used.
75 │    * @returns All the info needed for the builder itself.
76 │    */
77 ▶   resolveBuilder(builderName: string): Promise<BuilderInfoT | null>;
78 ▶   loadBuilder(info: BuilderInfoT): Promise<Builder | null>;
79 │ 
80 ▶   getCurrentDirectory(): Promise<string>;
81 ▶   getWorkspaceRoot(): Promise<string>;
82 │ 
83 ▶   getOptionsForTarget(target: Target): Promise<json.JsonObject | null>;
84 │ 
85 ▶   getProjectMetadata(projectName: string): Promise<json.JsonObject | null>;
86 ▶   getProjectMetadata(target: Target): Promise<json.JsonObject | null>;
87 │ }
```

`Architect` は `angular.json` も `node_modules` も直接は読まず、この 8 つの関数だけを使います。CLI と DEMO が使う実装が `WorkspaceNodeModulesArchitectHost`、テストで使う実装が[次の回](11-dvk-testing.md)の `TestingArchitectHost` です。71〜72 行目の JSDoc は「動的 `import()` に使う文字列を返す」と言いますが、77 行目の型は `BuilderInfoT` のオブジェクトで、文字列はその中の `import` です（[builder を探し出す章](../boot/02-boot-architect.md)の 5 節）。

📄 `angular-cli/packages/angular_devkit/architect/node/node-modules-architect-host.ts` L100–122 （▶ の行: 101, 103, 107–111, 115, 118）

```ts
100 │         async getMetadata(project) {
101 ▶           const projectDefinition = workspaceOrHost.projects.get(project);
102 │           if (!projectDefinition) {
103 ▶             throw new Error(`Project "${project}" does not exist.`);
104 │           }
105 │ 
106 │           return {
107 ▶             root: projectDefinition.root,
108 ▶             sourceRoot: projectDefinition.sourceRoot,
109 ▶             prefix: projectDefinition.prefix,
110 ▶             ...(clone(workspaceOrHost.extensions) as {}),
111 ▶             ...(clone(projectDefinition.extensions) as {}),
112 │           } as unknown as json.JsonObject;
113 │         },
114 │         async hasTarget(project, target) {
115 ▶           return !!workspaceOrHost.projects.get(project)?.targets.has(target);
116 │         },
117 │         async getDefaultConfigurationName(project, target) {
118 ▶           return workspaceOrHost.projects.get(project)?.targets.get(target)?.defaultConfiguration;
119 │         },
120 │       };
121 │     }
122 │   }
```

`getProjectMetadata` の中身は 107〜109 行目の 3 つに、110〜111 行目で workspace と project の「知らないキー」（`projectType` など）を重ねたものです。記録の「builder の中から context の関数を呼ぶ」では `{"root":"","sourceRoot":"src","prefix":"app","projectType":"application"}` でした。118 行目は 2 節で使う `defaultConfiguration` です。

📄 `angular-cli/packages/angular_devkit/architect/node/node-modules-architect-host.ts` L189–219 （▶ の行: 191–193, 195, 197, 202, 206, 208, 213–214, 216–217）

```ts
189 │ 
190 │     // Determine builder implementation path (relative within package only)
191 ▶     const implementationPath = builder.implementation && path.normalize(builder.implementation);
192 ▶     if (!implementationPath) {
193 ▶       throw new Error('Could not find the implementation for builder ' + builderStr);
194 │     }
195 ▶     if (path.isAbsolute(implementationPath) || implementationPath.startsWith('..')) {
196 │       throw new Error(
197 ▶         `Package "${packageName}" has an invalid builder implementation path: "${builderName}" --> "${builder.implementation}"`,
198 │       );
199 │     }
200 │ 
201 │     // Determine builder option schema path (relative within package only)
202 ▶     let schemaPath = builder.schema;
203 │     if (!schemaPath) {
204 │       throw new Error('Could not find the schema for builder ' + builderStr);
205 │     }
206 ▶     if (path.isAbsolute(schemaPath) || path.normalize(schemaPath).startsWith('..')) {
207 │       throw new Error(
208 ▶         `Package "${packageName}" has an invalid builder schema path: "${builderName}" --> "${builder.schema}"`,
209 │       );
210 │     }
211 │ 
212 │     // The file could be either a package reference or in the local manifest directory.
213 ▶     if (schemaPath.startsWith('.')) {
214 ▶       schemaPath = path.join(buildersManifestDirectory, schemaPath);
215 │     } else {
216 ▶       const manifestRequire = createRequire(buildersManifestDirectory + '/');
217 ▶       schemaPath = manifestRequire.resolve(schemaPath);
218 │     }
219 │ 
```

`builders.json` の `implementation` と `schema` は、パッケージの外を指せません（195 行目と 206 行目）。記録で `"implementation": "../escape.js"` の builder を呼ぶと「Package "demo-builders" has an invalid builder implementation path: "outside" --&gt; "../escape.js"」でした。213〜218 行目、`.` で始まらない schema はパッケージ名として解きます（2b8a02bac0、2024-12、`require build schemas from modules`。`.` で始まるものを Node の解決に回さないのは fe1ae69339）。

## 2. options の重ね方：configuration は浅く、overrides は 1 段深く

target の options を作るのは 2 か所です。`angular.json` の `options` と `configurations` を重ねるのは host の `getOptionsForTarget`（[builder を探し出す章](../boot/02-boot-architect.md)の 4 節の 244〜254 行目、スプレッドで浅く上書き）。その結果に、コマンドラインの値を重ねるのがここです。

📄 `angular-cli/packages/angular_devkit/architect/src/architect.ts` L58–94 （▶ の行: 59–60, 63, 66, 68, 70, 72, 75–76, 79–80, 83, 90）

```ts
58 │   const jobDescription: BuilderDescription = {
59 ▶     name: target ? `{${targetStringFromTarget(target)}}` : info.builderName,
60 ▶     argument: true,
61 │     input: true,
62 │     output: true,
63 ▶     info,
64 │   };
65 │ 
66 ▶   function handler(argument: json.JsonObject, context: JobHandlerContext) {
67 │     // Add input validation to the inbound bus.
68 ▶     const inboundBusWithInputValidation = context.inboundBus.pipe(
69 │       concatMap(async (message) => {
70 ▶         if (message.kind === JobInboundMessageKind.Input) {
71 │           const v = message.value as BuilderInput;
72 ▶           const options = mergeOptions(baseOptions, v.options);
73 │ 
74 │           // Validate v against the options schema.
75 ▶           const validation = await registry.compile(info.optionSchema);
76 ▶           const validationResult = await validation(options);
77 │           const { data, success, errors } = validationResult;
78 │ 
79 ▶           if (!success) {
80 ▶             throw new json.schema.SchemaValidationException(errors);
81 │           }
82 │ 
83 ▶           return { ...message, value: { ...v, options: data } } as JobInboundMessage<BuilderInput>;
84 │         } else {
85 │           return message as JobInboundMessage<BuilderInput>;
86 │         }
87 │       }),
88 │       // Using a share replay because the job might be synchronously sending input, but
89 │       // asynchronously listening to it.
90 ▶       shareReplay(1),
91 │     );
92 │ 
93 │     // Make an inboundBus that completes instead of erroring out.
94 │     // We'll merge the errors into the output instead.
```

📄 `angular-cli/packages/angular_devkit/architect/src/options.ts` L13–39 （▶ の行: 19–20, 23–25, 28–29, 33–34）

```ts
13 │ type OverrideOptions = BuilderInput['options'];
14 │ 
15 │ export function mergeOptions(
16 │   baseOptions: json.JsonObject,
17 │   overrideOptions: OverrideOptions,
18 │ ): json.JsonObject {
19 ▶   if (!overrideOptions) {
20 ▶     return { ...baseOptions };
21 │   }
22 │ 
23 ▶   const options = {
24 ▶     ...baseOptions,
25 ▶     ...overrideOptions,
26 │   };
27 │ 
28 ▶   // For object-object overrides, we merge one layer deep.
29 ▶   for (const key of Object.keys(overrideOptions)) {
30 │     const override = overrideOptions[key];
31 │     const base = baseOptions[key];
32 │ 
33 ▶     if (json.isJsonObject(base) && json.isJsonObject(override)) {
34 ▶       options[key] = { ...base, ...override };
35 │     }
36 │   }
37 │ 
38 │   return options;
39 │ }
```

1. **72 行目：`mergeOptions(baseOptions, v.options)`**

   `baseOptions` は host が作った target の options、`v.options` は `scheduleTarget` の 2 つ目の引数（overrides）です。
2. **23〜26 行目：まず浅く上書き、28〜36 行目：両方がオブジェクトなら 1 段だけ混ぜる**

   78f76485fe（2024-09、`merge object options from CLI`）が入れました。配列は混ぜずに置き換えます。
3. **75〜81 行目：builder の schema で検査**

   合わなければ 80 行目の `SchemaValidationException`。登録簿の `addUndefinedDefaults` が default を入れるのもここです。
4. **83 行目：検査した後の値で Input のメッセージを作り直す**

   builder の関数に渡るのはこの `data` です。

記録の「options の重ね方」の `echo` は、受け取った options をそのまま返す builder です。`angular.json` は `options: { a: 1, obj: { x: 1, y: 1 }, arr: [1, 2] }`、`defaultConfiguration: "dev"`、`dev: { a: 2, obj: { x: 2 } }`、`prod: { a: 3, b: 3, arr: [3] }` です。

| scheduleTarget | builder が受け取った options | 効いた行 |
| --- | --- | --- |
| configuration なし | `{"a":2,"obj":{"x":2},"arr":[1,2],"c":"c-default"}` | defaultConfiguration の dev。`obj` は丸ごと置き換え（y が消える）。`c` は schema の default |
| `configuration: 'prod'` | `{"a":3,"obj":{"x":1,"y":1},"arr":[3],"b":3,…}` | 指定があれば defaultConfiguration は使わない |
| `'dev,prod'` / `'prod,dev'` | `a` が 3 / 2 | カンマの右が勝つ |
| overrides `{ a: 9, obj: { y: 9 }, arr: [9] }` | `{"a":9,"obj":{"x":2,"y":9},"arr":[9],…}` | 33〜34 行目で `obj` は 1 段混ぜる。配列は置き換え |
| `configuration: 'nope'` | 「Configuration 'nope' for target 'echo' in project 'app' is not set in the workspace.」 | host の側（`scheduleTarget` の Promise が reject） |
| overrides `{ a: "x" }` | `run.result` が reject：「Data path "/a" must be number.」 | 80 行目 |

同じ `obj` でも、`configurations` で書くと丸ごと置き換わり、コマンドラインで渡すと 1 段混ざります。`scheduleBuilder`（3 節）には `angular.json` の options が無いので、記録の `scheduleBuilder('demo-builders:echo', { a: 5 })` は `{"a":5,"c":"c-default","obj":{},"arr":[]}` でした（`obj` と `arr` の空の値も `addUndefinedDefaults` が入れる。[第 3 回](03-dvk-schema.md)）。

## 3. scheduleBuilder と builder の job

📄 `angular-cli/packages/angular_devkit/architect/src/architect.ts` L366–387 （▶ の行: 371, 376–378, 381, 384–385）

```ts
366 │ 
367 │   has(name: JobName): Observable<boolean> {
368 │     return this._scheduler.has(name);
369 │   }
370 │ 
371 ▶   scheduleBuilder(
372 │     name: string,
373 │     options: json.JsonObject,
374 │     scheduleOptions: ScheduleOptions = {},
375 │   ): Promise<BuilderRun> {
376 ▶     // The below will match 'project:target:configuration'
377 ▶     if (!/^[^:]+:[^:]+(:[^:]+)?$/.test(name)) {
378 ▶       throw new Error('Invalid builder name: ' + JSON.stringify(name));
379 │     }
380 │ 
381 ▶     return scheduleByName(name, options, {
382 │       scheduler: this._scheduler,
383 │       logger: scheduleOptions.logger || new logging.NullLogger(),
384 ▶       currentDirectory: this._host.getCurrentDirectory(),
385 ▶       workspaceRoot: this._host.getWorkspaceRoot(),
386 │     });
387 │   }
```

📄 `angular-cli/packages/angular_devkit/architect/src/architect.ts` L207–219 （▶ の行: 210–212, 215–217）

```ts
207 │   get<A extends json.JsonObject, I extends BuilderInput, O extends BuilderOutput>(
208 │     name: string,
209 │   ): Observable<JobHandler<A, I, O> | null> {
210 ▶     const m = name.match(/^([^:]+):([^:]+)$/i);
211 ▶     if (!m) {
212 ▶       return of(null);
213 │     }
214 │ 
215 ▶     return from(this._resolveBuilder(name)).pipe(
216 ▶       concatMap((builderInfo) => (builderInfo ? this._createBuilder(builderInfo) : of(null))),
217 ▶       first(null, null),
218 │     ) as Observable<JobHandler<A, I, O> | null>;
219 │   }
```

`scheduleBuilder` は target を通らず、builder の名前（`パッケージ:builder`）で直接呼びます。377 行目の正規表現は 3 つ目の `:…` も許し、376 行目のコメントも「'project:target:configuration' に合う」と言いますが、渡すのは builder の名前です。3 つに割れる名前は 377 行目を通っても、210 行目の 2 つに割る正規表現で `null` になります。記録の `scheduleBuilder("demo-builders:echo:extra")` は「Job name "demo-builders:echo:extra" does not exist.」で、`:` の無い `"demo-builders"` は 378 行目で同期に「Invalid builder name」でした。

📄 `angular-cli/packages/angular_devkit/architect/src/architect.ts` L145–168 （▶ の行: 149–150, 156–157, 161–162, 167）

```ts
145 │ class ArchitectBuilderJobRegistry implements BuilderRegistry {
146 │   constructor(
147 │     protected _host: ArchitectHost,
148 │     protected _registry: json.schema.SchemaRegistry,
149 ▶     protected _jobCache?: Map<string, Observable<BuilderJobHandler | null>>,
150 ▶     protected _infoCache?: Map<string, Observable<BuilderInfo | null>>,
151 │   ) {}
152 │ 
153 │   protected _resolveBuilder(name: string): Observable<BuilderInfo | null> {
154 │     const cache = this._infoCache;
155 │     if (cache) {
156 ▶       const maybeCache = cache.get(name);
157 ▶       if (maybeCache !== undefined) {
158 │         return maybeCache;
159 │       }
160 │ 
161 ▶       const info = from(this._host.resolveBuilder(name)).pipe(shareReplay(1));
162 ▶       cache.set(name, info);
163 │ 
164 │       return info;
165 │     }
166 │ 
167 ▶     return from(this._host.resolveBuilder(name));
168 │   }
```

📄 `angular-cli/packages/angular_devkit/architect/src/architect.ts` L170–205 （▶ の行: 176–177, 182, 188, 193, 197–198, 200）

```ts
170 │   protected _createBuilder(
171 │     info: BuilderInfo,
172 │     target?: Target,
173 │     options?: json.JsonObject,
174 │   ): Observable<BuilderJobHandler | null> {
175 │     const cache = this._jobCache;
176 ▶     if (target) {
177 ▶       const maybeHit = cache && cache.get(targetStringFromTarget(target));
178 │       if (maybeHit) {
179 │         return maybeHit;
180 │       }
181 │     } else {
182 ▶       const maybeHit = cache && cache.get(info.builderName);
183 │       if (maybeHit) {
184 │         return maybeHit;
185 │       }
186 │     }
187 │ 
188 ▶     const result = _createJobHandlerFromBuilderInfo(
189 │       info,
190 │       target,
191 │       this._host,
192 │       this._registry,
193 ▶       options || {},
194 │     );
195 │ 
196 │     if (cache) {
197 ▶       if (target) {
198 ▶         cache.set(targetStringFromTarget(target), result.pipe(shareReplay(1)));
199 │       } else {
200 ▶         cache.set(info.builderName, result.pipe(shareReplay(1)));
201 │       }
202 │     }
203 │ 
204 │     return result;
205 │   }
```

builder の情報（161 行目）と job の関数（198・200 行目）は、Architect が持つ 2 つの `Map` に名前で覚えます。`Architect` を作り直さない限り、`builders.json` を書き換えても同じプロセスの中では前の情報が使われます。鍵に注意がいります。情報の鍵は 161 行目の `name`（`パッケージ:builder`）ですが、target の無い job の鍵は 182・200 行目の `info.builderName` で、`WorkspaceNodeModulesArchitectHost` の `builderName` は `:` の右だけ（記録の `"builderName":"echo"`）です。記録の「別のパッケージの同じ名前の builder」で、`other-builders`（builder 名 `echo`）を足して同じ `Architect` で `scheduleBuilder('demo-builders:echo')` → `scheduleBuilder('other-builders:echo')` の順に呼ぶと、2 つ目も `demo-builders` の echo が走りました。新しい `Architect` で `other-builders:echo` だけを呼べば `other-builders` のものが走ります。main も同じです。188 行目の `options` が 2 節の `baseOptions` で、target のとき（[builder を探し出す章](../boot/02-boot-architect.md)の 251〜257 行目）は host の options、`scheduleBuilder` のときは無し（`{}`）です。

📄 `angular-cli/packages/angular_devkit/architect/src/architect.ts` L106–136 （▶ の行: 107–108, 111, 121, 126–128, 132）

```ts
106 │               // Add target to it.
107 ▶               return {
108 ▶                 ...output,
109 │                 value: {
110 │                   ...output.value,
111 ▶                   ...(target ? { target } : 0),
112 │                 } as unknown as json.JsonObject,
113 │               };
114 │             } else {
115 │               return output;
116 │             }
117 │           }),
118 │         );
119 │       }),
120 │       // Share subscriptions to the output, otherwise the handler will be re-run.
121 ▶       shareReplay(),
122 │     );
123 │ 
124 │     // Separate the errors from the inbound bus into their own observable that completes when the
125 │     // builder output does.
126 ▶     const inboundBusErrors = inboundBusWithInputValidation.pipe(
127 ▶       ignoreElements(),
128 ▶       takeUntil(onErrorResumeNext(output.pipe(last()))),
129 │     );
130 │ 
131 │     // Return the builder output plus any input errors.
132 ▶     return merge(inboundBusErrors, output);
133 │   }
134 │ 
135 │   return of(Object.assign(handler, { jobDescription }) as BuilderJobHandler);
136 │ }
```

builder の出力には 111 行目で `target` が足されます。121 行目の `shareReplay()` のコメントのとおり、購読が増えても builder は 1 回しか走りません。126〜129 行目、2 節の検査の例外は出力の流れに混ぜて返すので、`run.result` の reject になります（2 節の表の最後の行）。記録の「同じ target を 2 つ同時に」では、30ms かかる `slow` を同時に 2 回 `scheduleTarget` すると、2 つとも 10ms で始まり並んで走りました。

📄 `angular-cli/packages/angular_devkit/architect/src/api.ts` L157–177 （▶ の行: 164–167）

```ts
157 │   /**
158 │    * The target that was used to run this builder.
159 │    * Target is optional if a builder was ran using `scheduleBuilder()`.
160 │    */
161 │   target?: Target;
162 │ 
163 │   /**
164 ▶    * Schedule a target in the same workspace. This can be the same target that is being executed
165 ▶    * right now, but targets of the same name are serialized.
166 ▶    * Running the same target and waiting for it to end will result in a deadlocking scenario.
167 ▶    * Targets are considered the same if the project, the target AND the configuration are the same.
168 │    * @param target The target to schedule.
169 │    * @param overrides A set of options to override the workspace set of options.
170 │    * @param scheduleOptions Additional optional scheduling options.
171 │    * @return A promise of a run. It will resolve when all the members of the run are available.
172 │    */
173 │   scheduleTarget(
174 │     target: Target,
175 │     overrides?: json.JsonObject,
176 │     scheduleOptions?: ScheduleOptions,
177 │   ): Promise<BuilderRun>;
```

`BuilderContext.scheduleTarget` の JSDoc の 164〜165 行目は「同じ名前の target は順に走る（serialized）」、166 行目は「同じ target を走らせて終わりを待つとデッドロックする」と言いますが、記録は並んで走り、`index_spec.ts` の `runs targets parallel`（111 行目）も同じ target を 2 回呼んで `called` が 2 になることを確かめています。順に走らせる仕組み（前の回の `strategy.serialize`）は、Architect のどこにも付いていません。main も同じです。

## 4. createBuilder：BuilderContext の中身

📄 `angular-cli/packages/angular_devkit/architect/src/create-builder.ts` L48–80 （▶ の行: 48, 50–53, 56, 61–62, 65, 67–68, 70, 74, 76–78）

```ts
48 ▶   const handler = cjh<json.JsonObject, BuilderInput, OutT>((options, context) => {
49 │     const scheduler = context.scheduler;
50 ▶     const progressChannel = context.createChannel('progress');
51 ▶     const logChannel = context.createChannel('log');
52 ▶     const addTeardown = context.addTeardown.bind(context);
53 ▶     let currentState: BuilderProgressState = BuilderProgressState.Stopped;
54 │     let current = 0;
55 │     let status = '';
56 ▶     let total = 1;
57 │ 
58 │     function log(entry: logging.LogEntry) {
59 │       logChannel.next(entry);
60 │     }
61 ▶     function progress(progress: TypedBuilderProgress, context: BuilderContext) {
62 ▶       currentState = progress.state;
63 │       if (progress.state === BuilderProgressState.Running) {
64 │         current = progress.current;
65 ▶         total = progress.total !== undefined ? progress.total : total;
66 │ 
67 ▶         if (progress.status === undefined) {
68 ▶           progress.status = status;
69 │         } else {
70 ▶           status = progress.status;
71 │         }
72 │       }
73 │ 
74 ▶       progressChannel.next({
75 │         ...(progress as json.JsonObject),
76 ▶         ...(context.target && { target: context.target }),
77 ▶         ...(context.builder && { builder: context.builder }),
78 ▶         id: context.id,
79 │       });
80 │     }
```

📄 `angular-cli/packages/angular_devkit/architect/src/create-builder.ts` L82–106 （▶ の行: 85, 87–88, 94–96, 98, 101–104, 106）

```ts
 82 │     return new Observable<OutT>((observer) => {
 83 │       const subscriptions: Subscription[] = [];
 84 │ 
 85 ▶       const inputSubscription = context.inboundBus.subscribe((i) => {
 86 │         switch (i.kind) {
 87 ▶           case JobInboundMessageKind.Input:
 88 ▶             onInput(i.value);
 89 │             break;
 90 │         }
 91 │       });
 92 │ 
 93 │       function onInput(i: BuilderInput) {
 94 ▶         const builder = i.info as BuilderInfo;
 95 ▶         const loggerName = i.target ? targetStringFromTarget(i.target) : builder.builderName;
 96 ▶         const logger = new logging.Logger(loggerName);
 97 │ 
 98 ▶         subscriptions.push(logger.subscribe((entry) => log(entry)));
 99 │ 
100 │         const context: BuilderContext = {
101 ▶           builder,
102 ▶           workspaceRoot: i.workspaceRoot,
103 ▶           currentDirectory: i.currentDirectory,
104 ▶           target: i.target,
105 │           logger: logger,
106 ▶           id: i.id,
```

`createBuilder(fn)` の中身は、[前の回](09-dvk-jobs.md)の `createJobHandler` の job です。50〜51 行目で progress と log の 2 つのチャンネルを作り、85〜91 行目で Input のメッセージ（[builder を探し出す章](../boot/02-boot-architect.md)の `scheduleByName` が送る）を待ちます。95 行目、logger の名前は target の文字列（記録の `logger[app:steps]`）か builder の名前で、98 行目でその出力を log チャンネルに流し、呼んだ側の logger に届きます。

📄 `angular-cli/packages/angular_devkit/architect/src/create-builder.ts` L142–176 （▶ の行: 142, 144–145, 150, 158, 166, 170, 172–173）

```ts
142 ▶           async getTargetOptions(target: Target) {
143 │             return firstValueFrom(
144 ▶               scheduler.schedule<Target, json.JsonValue, json.JsonObject>(
145 ▶                 '..getTargetOptions',
146 │                 target,
147 │               ).output,
148 │             );
149 │           },
150 ▶           async getProjectMetadata(target: Target | string) {
151 │             return firstValueFrom(
152 │               scheduler.schedule<Target | string, json.JsonValue, json.JsonObject>(
153 │                 '..getProjectMetadata',
154 │                 target,
155 │               ).output,
156 │             );
157 │           },
158 ▶           async getBuilderNameForTarget(target: Target) {
159 │             return firstValueFrom(
160 │               scheduler.schedule<Target, json.JsonValue, string>(
161 │                 '..getBuilderNameForTarget',
162 │                 target,
163 │               ).output,
164 │             );
165 │           },
166 ▶           async validateOptions<T extends json.JsonObject = json.JsonObject>(
167 │             options: json.JsonObject,
168 │             builderName: string,
169 │           ) {
170 ▶             return firstValueFrom(
171 │               scheduler.schedule<[string, json.JsonObject], json.JsonValue, T>(
172 ▶                 '..validateOptions',
173 ▶                 [builderName, options],
174 │               ).output,
175 │             );
176 │           },
```

📄 `angular-cli/packages/angular_devkit/architect/src/architect.ts` L300–338 （▶ の行: 301, 303–305, 311, 318, 320, 325–326, 328–329, 335）

```ts
300 │ function _getBuilderNameForTargetFactory(host: ArchitectHost) {
301 ▶   return createJobHandler<Target, never, string>(
302 │     async (target) => {
303 ▶       const builderName = await host.getBuilderNameForTarget(target);
304 ▶       if (!builderName) {
305 ▶         throw new Error(`No builder were found for target ${targetStringFromTarget(target)}.`);
306 │       }
307 │ 
308 │       return builderName;
309 │     },
310 │     {
311 ▶       name: '..getBuilderNameForTarget',
312 │     },
313 │   );
314 │ }
315 │ 
316 │ function _validateOptionsFactory(host: ArchitectHost, registry: json.schema.SchemaRegistry) {
317 │   return createJobHandler<[string, json.JsonObject], never, json.JsonObject>(
318 ▶     async ([builderName, options]) => {
319 │       // Get option schema from the host.
320 ▶       const builderInfo = await host.resolveBuilder(builderName);
321 │       if (!builderInfo) {
322 │         throw new Error(`No builder info were found for builder ${JSON.stringify(builderName)}.`);
323 │       }
324 │ 
325 ▶       const validation = await registry.compile(builderInfo.optionSchema);
326 ▶       const { data, success, errors } = await validation(options);
327 │ 
328 ▶       if (!success) {
329 ▶         throw new json.schema.SchemaValidationException(errors);
330 │       }
331 │ 
332 │       return data as json.JsonObject;
333 │     },
334 │     {
335 ▶       name: '..validateOptions',
336 │     },
337 │   );
338 │ }
```

`getTargetOptions` などは、関数を直接呼ばず、同じ scheduler に `'..getTargetOptions'` のような名前の job を schedule して最初の出力を待ちます（144〜147 行目）。名前の先頭の `..` は、builder の名前（`パッケージ:builder`）とも target の名前（`{…}`）とも重ならない印です。中身は 300〜338 行目のような `createJobHandler` の job で、host に聞くだけです。記録では `getTargetOptions(app:echo:prod)` が `{"a":3,"obj":{"x":1,"y":1},"arr":[3],"b":3}`（schema の default の `c` は入らない。JSDoc の「検査しない」のとおり）、`validateOptions({ a: 1 }, 'demo-builders:echo')` は default 入りの `{"a":1,"c":"c-default","obj":{},"arr":[]}`、`{ a: 'x' }` は 329 行目の例外でした。

📄 `angular-cli/packages/angular_devkit/architect/src/api.ts` L205–224 （▶ の行: 211, 214–215, 218–219, 221）

```ts
205 │   /**
206 │    * Resolves and return a builder name. The exact format of the name is up to the host,
207 │    * so it should not be parsed to gather information (it's free form). This string can be
208 │    * used to validate options or schedule a builder directly.
209 │    * @param target The target to resolve the builder name.
210 │    */
211 ▶   getBuilderNameForTarget(target: Target): Promise<string>;
212 │ 
213 │   /**
214 ▶    * Validates the options against a builder schema. This uses the same methods as the
215 ▶    * scheduleTarget and scheduleBrowser methods to validate and apply defaults to the options.
216 │    * It can be generically typed, if you know which interface it is supposed to validate against.
217 │    * @param options A generic option object to validate.
218 ▶    * @param builderName The name of a builder to use. This can be gotten for a target by using the
219 ▶    *                    getBuilderForTarget() method on the context.
220 │    */
221 ▶   validateOptions<T extends json.JsonObject = json.JsonObject>(
222 │     options: json.JsonObject,
223 │     builderName: string,
224 │   ): Promise<T>;
```

`validateOptions` の JSDoc の 215 行目の `scheduleBrowser` は `scheduleBuilder`、218〜219 行目の `getBuilderForTarget()` は 211 行目の `getBuilderNameForTarget()` の書き損じです。

## 5. progress と結果の流れ

📄 `angular-cli/packages/angular_devkit/architect/src/create-builder.ts` L177–202 （▶ の行: 178–181, 186–188, 190–191, 196–198, 201）

```ts
177 │           reportRunning() {
178 ▶             switch (currentState) {
179 ▶               case BuilderProgressState.Waiting:
180 ▶               case BuilderProgressState.Stopped:
181 ▶                 progress({ state: BuilderProgressState.Running, current: 0, total }, context);
182 │                 break;
183 │             }
184 │           },
185 │           reportStatus(status: string) {
186 ▶             switch (currentState) {
187 ▶               case BuilderProgressState.Running:
188 ▶                 progress({ state: currentState, status, current, total }, context);
189 │                 break;
190 ▶               case BuilderProgressState.Waiting:
191 ▶                 progress({ state: currentState, status }, context);
192 │                 break;
193 │             }
194 │           },
195 │           reportProgress(current: number, total?: number, status?: string) {
196 ▶             switch (currentState) {
197 ▶               case BuilderProgressState.Running:
198 ▶                 progress({ state: currentState, current, total, status }, context);
199 │             }
200 │           },
201 ▶           addTeardown,
202 │         };
```

📄 `angular-cli/packages/angular_devkit/architect/src/create-builder.ts` L218–249 （▶ の行: 220, 224–227, 229, 231, 237–239, 245–246）

```ts
218 │ 
219 │         // Manage some state automatically.
220 ▶         progress({ state: BuilderProgressState.Running, current: 0, total: 1 }, context);
221 │         subscriptions.push(
222 │           result
223 │             .pipe(
224 ▶               defaultIfEmpty({ success: false } as unknown),
225 ▶               tap(() => {
226 ▶                 progress({ state: BuilderProgressState.Running, current: total }, context);
227 ▶                 progress({ state: BuilderProgressState.Stopped }, context);
228 │               }),
229 ▶               mergeMap(async (value) => {
230 │                 // Allow the log queue to flush
231 ▶                 await new Promise<void>(setImmediate);
232 │ 
233 │                 return value;
234 │               }),
235 │             )
236 │             .subscribe(
237 ▶               (message) => observer.next(message as OutT),
238 ▶               (error) => observer.error(error),
239 ▶               () => observer.complete(),
240 │             ),
241 │         );
242 │       }
243 │ 
244 │       return () => {
245 ▶         subscriptions.forEach((x) => x.unsubscribe());
246 ▶         inputSubscription.unsubscribe();
247 │       };
248 │     });
249 │   });
```

fn を呼ぶ前に 204 行目（[builder を探し出す章](../boot/02-boot-architect.md)）で `reportRunning()`、呼んだ直後に 220 行目でもう一度 `Running` を出し、出力が 1 つ出るたびに 226〜227 行目で「current = total」と `Stopped` を出します。224 行目、出力が 1 つも無く終わると `{ success: false }` です。報告の関数は state を見て、`reportStatus` は Running か Waiting のとき（186〜193 行目）、`reportProgress` は Running のとき（196〜199 行目）だけ効きます。

記録の「progress と output の流れ」の `steps` は、`reportStatus('準備中')` → `reportProgress(1, 4, '1/4')` → `reportProgress(3)` → 1 回目の出力 → `reportRunning()` → `reportStatus('2 回目')` → 2 回目の出力、の順に呼びます。progress は「running current=0 total=1」が 2 回（204 行目と 220 行目）→ 準備中 → 1/4 current=1 total=4 → current=3（65 行目で total は前の 4 のまま）→ 出力の前に current=4 と stopped → `reportRunning` で running current=0 → 2 回目 → current=4・stopped、でした。`run.result` は 1 回目ではなく最後の round 2 です（DEMO は `lastOutput` を待った）。

📄 `angular-cli/packages/angular_devkit/architect/src/schedule-by-name.ts` L82–112 （▶ の行: 82, 84, 89, 91–92, 97, 102–103, 106, 110）

```ts
 82 ▶   const logChannelSub = job.getChannel<logging.LogEntry>('log').subscribe({
 83 │     next: (entry) => {
 84 ▶       logger.next(entry);
 85 │     },
 86 │     error: () => {},
 87 │   });
 88 │ 
 89 ▶   const outboundBusSub = job.outboundBus.subscribe({
 90 │     error() {},
 91 ▶     complete() {
 92 ▶       outboundBusSub.unsubscribe();
 93 │       logChannelSub.unsubscribe();
 94 │       stateSubscription.unsubscribe();
 95 │     },
 96 │   });
 97 ▶   const output = job.output.pipe(
 98 │     map(
 99 │       (output) =>
100 │         ({
101 │           ...output,
102 ▶           ...(options.target ? { target: options.target } : 0),
103 ▶           info,
104 │         }) as unknown as BuilderOutput,
105 │     ),
106 ▶     shareReplay(),
107 │   );
108 │ 
109 │   // Start the builder.
110 ▶   output.pipe(first()).subscribe({
111 │     error: () => {},
112 │   });
```

📄 `angular-cli/packages/angular_devkit/architect/src/schedule-by-name.ts` L113–139 （▶ の行: 117–119, 121–122, 125–129, 131）

```ts
113 │ 
114 │   return {
115 │     id,
116 │     info,
117 ▶     // This is a getter so that it always returns the next output, and not the same one.
118 ▶     get result() {
119 ▶       return firstValueFrom(output);
120 │     },
121 ▶     get lastOutput() {
122 ▶       return lastValueFrom(output);
123 │     },
124 │     output,
125 ▶     progress: job
126 ▶       .getChannel<BuilderProgressReport>('progress', progressSchema)
127 ▶       .pipe(shareReplay(1)),
128 ▶     stop() {
129 ▶       job.stop();
130 │ 
131 ▶       return job.outboundBus
132 │         .pipe(
133 │           ignoreElements(),
134 │           catchError(() => EMPTY),
135 │         )
136 │         .toPromise();
137 │     },
138 │   };
139 │ }
```

📄 `angular-cli/packages/angular_devkit/architect/src/api.ts` L73–102 （▶ の行: 77, 83, 87, 89, 94, 96, 102）

```ts
 73 │   /**
 74 │    * The next output from a builder. This is recommended when scheduling a builder and only being
 75 │    * interested in the result of that single run, not of a watch-mode builder.
 76 │    */
 77 ▶   result: Promise<BuilderOutput>;
 78 │ 
 79 │   /**
 80 │    * The last output from a builder. This is recommended when scheduling a builder and only being
 81 │    * interested in the result of that last run.
 82 │    */
 83 ▶   lastOutput: Promise<BuilderOutput>;
 84 │ 
 85 │   /**
 86 │    * The output(s) from the builder. A builder can have multiple outputs.
 87 ▶    * This always replay the last output when subscribed.
 88 │    */
 89 ▶   output: Observable<BuilderOutput>;
 90 │ 
 91 │   /**
 92 │    * The progress report. A progress also contains an ID, which can be different than this run's
 93 │    * ID (if the builder calls scheduleBuilder or scheduleTarget).
 94 ▶    * This will always replay the last progress on new subscriptions.
 95 │    */
 96 ▶   progress: Observable<BuilderProgressReport>;
 97 │ 
 98 │   /**
 99 │    * Stop the builder from running. Returns a promise that resolves when the builder is stopped.
100 │    * Some builders might not handle stopping properly and should have a timeout here.
101 │    */
102 ▶   stop(): Promise<void>;
```

`run.result` は 118〜120 行目のゲッターで「次の出力」、`run.lastOutput` は「最後の出力」です。110 行目で購読を 1 つ始めるので、呼んだ側が何も購読しなくても builder は走ります（前の回の「購読するまで動かない」を、ここで動かしている）。api.ts の JSDoc と比べると、87 行目「購読したとき最後の出力を流す」の `output` は 106 行目の `shareReplay()`（数の指定なし）なので**全部**を流し、記録の「終わった後に output と progress を購読」では round の `[1,2]` が届きました。94 行目「progress は最後の 1 つをいつも流す」は、126〜127 行目の `shareReplay(1)` が最初の購読から溜め始めるので、終わった後に初めて購読すると何も届きませんでした（`[]`）。

## 6. builder が失敗したとき・投げたとき

📄 `angular-cli/packages/angular_devkit/architect/src/api.ts` L259–297 （▶ の行: 260–261, 264, 268, 272–275, 284, 287–289, 293, 296）

```ts
259 │ export function isBuilderOutput(obj: any): obj is BuilderOutput {
260 ▶   if (!obj || typeof obj.then === 'function' || typeof obj.subscribe === 'function') {
261 ▶     return false;
262 │   }
263 │ 
264 ▶   if (typeof obj[Symbol.asyncIterator] === 'function') {
265 │     return false;
266 │   }
267 │ 
268 ▶   return typeof obj.success === 'boolean';
269 │ }
270 │ 
271 │ export function fromAsyncIterable<T>(iterable: AsyncIterable<T>): Observable<T> {
272 ▶   return new Observable((subscriber) => {
273 ▶     handleAsyncIterator(subscriber, iterable[Symbol.asyncIterator]()).then(
274 ▶       () => subscriber.complete(),
275 ▶       (error) => subscriber.error(error),
276 │     );
277 │   });
278 │ }
279 │ 
280 │ async function handleAsyncIterator<T>(
281 │   subscriber: Subscriber<T>,
282 │   iterator: AsyncIterator<T>,
283 │ ): Promise<void> {
284 ▶   const teardown = new Promise<void>((resolve) => subscriber.add(() => resolve()));
285 │ 
286 │   try {
287 ▶     while (!subscriber.closed) {
288 ▶       const result = await Promise.race([teardown, iterator.next()]);
289 ▶       if (!result || result.done) {
290 │         break;
291 │       }
292 │ 
293 ▶       subscriber.next(result.value);
294 │     }
295 │   } finally {
296 ▶     await iterator.return?.();
297 │   }
```

fn の戻り値は [builder を探し出す章](../boot/02-boot-architect.md)の 208〜214 行目で Observable にそろえます。260〜268 行目、`success` が boolean のオブジェクトなら 1 つの出力、async generator なら 271〜298 行目の `fromAsyncIterable`（購読を外すと 284・288 行目で待ちをやめ、296 行目で generator を閉じる）、それ以外は Promise か Observable です。

| builder の fn | `run.result`（記録） |
| --- | --- |
| `{ success: false, error: '…' }` を返す | resolve：`{"success":false,"error":"自分で失敗を返した",…}` |
| 何も出さずに完了（`EMPTY`） | resolve：`{"success":false}`（224 行目） |
| async で投げる・同期で投げる・Observable の error | reject：投げた `Error` そのもの（「async で投げた」など）。`{ success: false }` にはならない |
| async generator が `success: true` → `false` を出す | output は 2 つ、`lastOutput` は 2 つ目の `success: false` |
| schema の `required` を渡さない | reject：`SchemaValidationException`「must have required property 'mode'.」（2 節の 80 行目） |
| `createBuilder` を通していない `module.exports = { notABuilder: true }` | reject：「TypeError: Cannot read properties of undefined (reading 'Symbol(@angular-devkit/architect:builder)')」 |

最後の行は、[builder を探し出す章](../boot/02-boot-architect.md)の 6 節の `loadBuilder` の 277 行目 `builder?.default[BuilderSymbol]` で、CommonJS の module の `default`（`module.exports`）にさらに `default` が無いと、`?.` の後ろの `[BuilderSymbol]` が `undefined` を読んで投げるからです。281 行目の「Builder is not a builder」には届きません。main も同じです。

📄 `angular-cli/packages/angular_devkit/architect/src/internal.ts` L16–30 （▶ の行: 17, 22, 25–26, 30）

```ts
16 │ /**
17 ▶  * BuilderSymbol used for knowing if a function was created using createBuilder(). This is a
18 │  * property set on the function that should be `true`.
19 │  * Using Symbol.for() as it's a global registry that's the same for all installations of
20 │  * Architect (if some libraries depends directly on architect instead of sharing the files).
21 │  */
22 ▶ export const BuilderSymbol: unique symbol = Symbol.for('@angular-devkit/architect:builder');
23 │ 
24 │ /**
25 ▶  * BuilderVersionSymbol used for knowing which version of the library createBuilder() came from.
26 ▶  * This is to make sure we don't try to use an incompatible builder.
27 │  * Using Symbol.for() as it's a global registry that's the same for all installations of
28 │  * Architect (if some libraries depends directly on architect instead of sharing the files).
29 │  */
30 ▶ export const BuilderVersionSymbol: unique symbol = Symbol.for('@angular-devkit/architect:version');
```

25〜26 行目のコメントは「`BuilderVersionSymbol` は互換でない builder を使わないためのもの」と言いますが、この印を付けるのは `createBuilder` の 254 行目だけで、読む所は src にも node にもありません（`loadBuilder` が確かめるのは 22 行目の `BuilderSymbol` だけ）。

📄 `angular-cli/packages/angular_devkit/architect/src/api.ts` L353–392 （▶ の行: 366, 372–374, 376, 380, 382–383, 387）

```ts
353 │ /**
354 │  * Schedule a target, and forget about its run. This will return an observable of outputs, that
355 │  * as a teardown will stop the target from running. This means that the Run object this returns
356 │  * should not be shared.
357 │  *
358 │  * The reason this is not part of the Context interface is to keep the Context as normal form as
359 │  * possible. This is really an utility that people would implement in their project.
360 │  *
361 │  * @param context The context of your current execution.
362 │  * @param target The target to schedule.
363 │  * @param overrides Overrides that are used in the target.
364 │  * @param scheduleOptions Additional scheduling options.
365 │  */
366 ▶ export function scheduleTargetAndForget(
367 │   context: BuilderContext,
368 │   target: Target,
369 │   overrides?: json.JsonObject,
370 │   scheduleOptions?: ScheduleOptions,
371 │ ): Observable<BuilderOutput> {
372 ▶   let resolve: (() => void) | null = null;
373 ▶   const promise = new Promise<void>((r) => (resolve = r));
374 ▶   context.addTeardown(() => promise);
375 │ 
376 ▶   return from(context.scheduleTarget(target, overrides, scheduleOptions)).pipe(
377 │     switchMap(
378 │       (run) =>
379 │         new Observable<BuilderOutput>((observer) => {
380 ▶           const subscription = run.output.subscribe(observer);
381 │ 
382 ▶           return () => {
383 ▶             subscription.unsubscribe();
384 │             // We can properly ignore the floating promise as it's a "reverse" promise; the teardown
385 │             // is waiting for the resolve.
386 │             // eslint-disable-next-line @typescript-eslint/no-floating-promises
387 ▶             run.stop().then(resolve);
388 │           };
389 │         }),
390 │     ),
391 │   );
392 │ }
```

builder の中から別の target を走らせて、その出力をそのまま流す道具です。374 行目で「呼んだ target が止まるまで待つ」teardown を足し、382〜388 行目で購読を外したときに `run.stop()` を呼んで、止まったら teardown を解きます。公開の API ですが、44129f66a3 の packages の中に呼ぶ所はありません（grep で api.ts の定義だけ）。

> **🧪 DEMO — Architect で自作の builder を動かした記録**
>
> ボタンは、記録用のワークスペースで `Architect` の `scheduleTarget`・`scheduleBuilder` を呼んだ記録を再生します。`結果` は `run.result`（「progress と output」と async generator では `run.lastOutput`）の値で、`info` は builder の名前だけに縮めました。`例外` は Promise の reject か同期の例外です。
>
> ボタンを押すと記録が出ます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/dvk-architect)

## ここまでの呼び出し（scheduleTarget(app:echo, overrides)）

- 👤 `architect.scheduleTarget(target, overrides)` — architect.ts L388
  - `scheduleByName('{app:echo}', overrides)` — schedule-by-name.ts L36 — *builder を探し出す章*
    - `ArchitectTargetJobRegistry.get` → `host.getOptionsForTarget` — architect.ts L226・host L239 — *options + configuration（浅く）*
    - `_createBuilder(info, target, options)` — architect.ts L170 — *名前でキャッシュ*
      - `_createJobHandlerFromBuilderInfo` — L58
        - `mergeOptions(baseOptions, v.options)` → schema で検査 — L72・options.ts L15・L75 — *overrides は 1 段深く*
    - `output.pipe(first()).subscribe()` — schedule-by-name.ts L110 — *ここで builder が走り出す*
      - `createBuilder` の `onInput(i)` → `BuilderContext` — create-builder.ts L93・L100
        - `reportRunning()` → `fn(options, context)` → `progress(Running)` — L204・L207・L220
        - 出力ごとに `progress(current = total)`・`progress(Stopped)` — L225〜228
  - `run.result` / `run.lastOutput` — schedule-by-name.ts L118・L121

## テストと直し方

| ファイル | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `src/index_spec.ts` | `architect`（19）› `works`（65）・`runs builders parallel`（100）・`runs targets parallel`（111）・`passes options to targets`（130）・`errors when target configuration does not exist`（138）・`works with watching observable builders`（151）・`reports errors in the builder`（238）・`reports errors in options`（292）・`exposes validateOptions()`（389）ほか、全 18 | 3〜6 節。`TestingArchitectHost`（次の回）の上で動かす。`WorkspaceNodeModulesArchitectHost` の spec は無い |
| `src/options_spec.ts` | `mergeOptions`（11）› `overwrites literal values`（12）・`merges object values one layer deep`（37） | 2 節の 23〜36 行目。configuration の側の浅い上書きと比べる it は無い |
| `src/api_spec.ts` | `Architect API`（11）› `targetFromTargetString`（26）・`targetStringFromTarget`（39） | target の文字列 |

📄 `走らせたコマンド（2026-11-26）`

```
$ cd ~/angular-research/angular-cli      # 44129f66a3、読むだけ
$ pnpm bazel test //packages/angular_devkit/architect:test --nocache_test_results --test_output=all
$ pnpm bazel test //packages/angular_devkit/architect/node:test --nocache_test_results --test_output=all
（結果は下の段落）
```

手元の bazel で `architect:test` は 68 specs・0 failures、`architect/node:test` は 1 spec・0 failures でした（node の 1 つは前の回の `NodeModuleJobRegistry`）。

直すとしたら、3 節の JSDoc（api.ts の 164〜166 行目）は実際に合わせて「同じ target も並んで走る」に直すのが、spec（`runs targets parallel`）とも合います。376〜377 行目は builder の名前なので、コメントと正規表現を `^[^:]+:[^:]+$` にそろえます（`scheduleBuilder` の 3 つの名前の it を index\_spec.ts に足す）。3 節のキャッシュの鍵は、182 行目と 200 行目を 161 行目と同じ `パッケージ:builder` の名前（`WorkspaceNodeModulesArchitectHost` なら `info.name`、`TestingArchitectHost` なら `info.builderName`。`_createBuilder` に名前を引数で渡す形）にすれば、別のパッケージの同じ名前の builder を取り違えません（`TestingArchitectHost` は `builderName` にパッケージ名まで入れるので、index\_spec.ts では起きない。spec は 2 つの host で同じ名前の builder を足して確かめる）。5 節の 87 行目と 94 行目の JSDoc は「全部を流す」「購読した後の最後の 1 つ」に直すか、`output` を `shareReplay(1)` に、progress を作った時点で購読を 1 つ始める形にします。6 節の `loadBuilder` は 277 行目を `builder?.default?.[BuilderSymbol]` にすれば「Builder is not a builder」に届きます（`WorkspaceNodeModulesArchitectHost` の spec を node の下に作る）。

## 聞かれそうな質問

**Q. `angular.json` の configuration と `--option` で、オブジェクトの値の重なり方は同じですか？**

違います。configuration は host の `getOptionsForTarget` のスプレッドで丸ごと置き換え、コマンドラインの値は `mergeOptions` の 33〜34 行目で 1 段だけ混ぜます。記録の `obj` は dev で `{x:2}`、overrides `{y:9}` で `{x:2,y:9}` でした。配列はどちらも置き換えです。

**Q. builder の中で例外を投げると、`{ success: false }` になりますか？**

なりません。`run.result` が投げた Error で reject します（6 節の表）。`{ success: false }` になるのは、自分で返したときと、何も出さずに完了したとき（224 行目）です。

**Q. 同じ target を 2 回 `scheduleTarget` すると、順に走りますか？**

並んで走ります。JSDoc（164〜165 行目）は順に走ると言いますが、記録も `runs targets parallel` の spec も並んで走りました。

**Q. `getTargetOptions` と `validateOptions` の違いは？**

`getTargetOptions` は `angular.json` から読んだだけ（schema の default は入らない）、`validateOptions` は builder の schema で検査して default を入れた値です（記録の `c` の有り無し）。どちらも `'..getTargetOptions'` のような job を schedule して答えを得ます（144〜147 行目）。

**Q. `run.result` と `run.lastOutput` はどちらを待てばよいですか？**

watch で何度も出力する builder なら `result`（次の 1 つ、118〜120 行目）、1 回で終わる builder の最後を見たいなら `lastOutput`（121〜123 行目）です。`ng build` の CLI は `lastOutput` を待ちます（builder を探し出す章の 3 節）。

## 読み終えて

- Architect は host の 8 つの関数だけで workspace と node\_modules を見る。builder の情報と job は名前でキャッシュする。
- options は「options → configuration（カンマの右が勝つ、浅い）→ overrides（1 段深い）→ schema の検査と default」の順。`scheduleBuilder` は `angular.json` を見ない。
- `createBuilder` の context の `getTargetOptions` などは、同じ scheduler の `..` で始まる job。logger と progress はチャンネルで呼んだ側へ流れる。
- progress は Running を 2 回出してから始まり、出力ごとに Stopped。builder が投げると `run.result` は reject する。
- JSDoc の「同じ target は順に」「最後の出力を流す」「progress の最後をいつも流す」と、`BuilderVersionSymbol` のコメントは実物と違う。

---

← 前: [architect の jobs：scheduler・registry・strategy](09-dvk-jobs.md)  
次: [テストの道具：SchematicTestRunner と TestingArchitectHost](11-dvk-testing.md) →
