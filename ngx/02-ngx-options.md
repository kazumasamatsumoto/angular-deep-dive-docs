[目次](../README.md) › [ng コマンドの内側](README.md) › 第 2 回 / 全 10 回

# schema からオプションを作る：command-builder/utilities

> src/command-builder/utilities/json-schema.ts・json-help.ts・normalize-options-middleware.ts・schematics-command-module.ts・architect-command-module.ts・architect-base-command-module.ts・memoize.ts：JSON schema の型（string・boolean・number・enum・array・oneOf・key=value の map）が yargs のオプションに変わる規則、default を --help のときだけ渡す理由、required が yargs に渡らないこと、x-prompt と --defaults、位置引数の並べ方、builder の project の決め方。自作の schematic と builder で確かめる。

angular/angular-cli · 読了 約 14 分 · 発展 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/ngx-options)

---

この章で分かること：schematic や builder の JSON schema（オプションの型と説明を書いた JSON）が、`ng generate`・`ng run` などの yargs のオプションと `--help` の行にどう変わるか。型ごとの規則（string・boolean・number・enum・array・oneOf・key=value の map）、`default` を `--help` のときだけ渡す理由、`alias`・`x-prompt`・`$default` の扱い、builder の project の決め方を、記録用のワークスペースに置いた自作の schematic と builder（同じ schema）で確かめます。

読む対象は `packages/angular/cli/src/command-builder/` の `utilities/json-schema.ts`・`utilities/normalize-options-middleware.ts`・`utilities/json-help.ts`・`command-module.ts`・`schematics-command-module.ts`・`architect-command-module.ts`・`architect-base-command-module.ts` と、`src/utilities/memoize.ts` です（../angular-cli、44129f66a3）。schematic の実行（`runSchematic`）と `projectName` の smart default は[ng generate component の章](../cli/15-schematics-component.md)、builder を選んで走らせる `runSingleTarget` は[builder を探し出す章](../boot/02-boot-architect.md)が読んでいます。

1. [1. ng と打ってから](01-ngx-entry.md)
2. **2. schema からオプション**（この章）
3. [3. angular.json と設定](03-ngx-config.md)
4. [4. パッケージマネージャー](04-ngx-package-managers.md)
5. [5. ng add](05-ngx-add.md)
6. [6. ng update](06-ngx-update.md)
7. [7. generate・new・run・version](07-ngx-generate-run.md)
8. [8. analytics](08-ngx-analytics.md)
9. [9. ng mcp](09-ngx-mcp.md)
10. [10. spec と issue](10-ngx-tests-issues.md)

> [!TIP]
> **新卒エンジニアへ**
>
> yargs は Node のコマンドラインの引数を読むライブラリで、「このオプションは boolean」「この名前の別名は -f」と登録しておくと、`process.argv` を値のオブジェクトにし、`--help` の表も作ります。Angular CLI は schema を読んでこの登録を自動で作ります。DEMO の記録はローカルの `@angular/cli` 22.2.7 で取りました。引用の 44129f66a3 と 22.2.7 は、この章の範囲では 3 か所が違います：`json-schema.ts` の 392〜400 行目の並べ方（4 節）、`schematics-command-module.ts` の 126〜127 行目と 399〜411 行目（project が決まらないときに例外を投げる形、540a1c495d）、`architect-command-module.ts` の 72 行目の説明文（6 節）。記録は 22.2.7 の振る舞いです。

## 1. どの schema の行がオプションになるか

📄 `angular-cli/packages/angular/cli/src/command-builder/utilities/json-schema.ts` L306–345 （▶ の行: 306, 309, 318–321, 327, 329, 333, 339, 341, 343）

```ts
306 ▶ export async function parseJsonSchemaToOptions(
307 │   registry: json.schema.SchemaRegistry,
308 │   schema: json.JsonObject,
309 ▶   interactive = true,
310 │ ): Promise<Option[]> {
311 │   const options: Option[] = [];
312 │ 
313 │   function visitor(
314 │     current: json.JsonObject | json.JsonArray,
315 │     pointer: json.schema.JsonPointer,
316 │     parentSchema?: json.JsonObject | json.JsonArray,
317 │   ) {
318 ▶     if (
319 ▶       !parentSchema ||
320 ▶       json.isJsonArray(current) ||
321 ▶       pointer.split(/\/(?:properties|items|definitions)\//g).length > 2
322 │     ) {
323 │       // Ignore root, arrays, and subitems.
324 │       return;
325 │     }
326 │ 
327 ▶     if (pointer.includes('/not/')) {
328 │       // We don't support anyOf/not.
329 ▶       throw new Error('The "not" keyword is not supported in JSON Schema.');
330 │     }
331 │ 
332 │     const ptr = json.schema.parseJsonPointer(pointer);
333 ▶     if (ptr[ptr.length - 2] !== 'properties') {
334 │       // Skip any non-property items.
335 │       return;
336 │     }
337 │     const name = ptr.at(-1) as string;
338 │ 
339 ▶     const types = getSupportedTypes(current);
340 │ 
341 ▶     if (types.length === 0) {
342 │       // This means it's not usable on the command line. e.g. an Object.
343 ▶       return;
344 │     }
345 │ 
```

`parseJsonSchemaToOptions` は schema の木を歩く `visitor` を作ります（歩くのは L389 の `visitJsonSchema`）。318〜325 行目で、根と配列と、`properties`・`items`・`definitions` を 2 段より深くたどったもの（入れ子のプロパティ）を捨てます。327〜330 行目、`not` の下があれば例外です。333 行目で `properties` の直下だけを残します。339〜344 行目で CLI で受けられる型が 1 つも無ければ捨てます。記録の schema の `nested`（`properties` を持つ object）は `--help` にも `--json-help` にも出ず、`--nested.a=1` と打つと「Unknown argument: nested.a」でした。

📄 `angular-cli/packages/angular/cli/src/command-builder/utilities/json-schema.ts` L185–208 （▶ の行: 188, 194, 196–198, 200–203）

```ts
185 │ function getSupportedTypes(
186 │   current: json.JsonObject,
187 │ ): ReadonlyArray<'string' | 'number' | 'boolean' | 'array' | 'object'> {
188 ▶   const typeSet = json.schema.getTypesOfSchema(current);
189 │ 
190 │   if (typeSet.size === 0) {
191 │     return [];
192 │   }
193 │ 
194 ▶   return [...typeSet].filter((type) => {
195 │     switch (type) {
196 ▶       case 'boolean':
197 ▶       case 'number':
198 ▶       case 'string':
199 │         return true;
200 ▶       case 'array':
201 ▶         return isJsonObject(current.items) && isSupportedArrayItemSchema(current.items);
202 ▶       case 'object':
203 ▶         return isStringMap(current);
204 │       default:
205 │         return false;
206 │     }
207 │   }) as ReadonlyArray<'string' | 'number' | 'boolean' | 'array' | 'object'>;
208 │ }
```

188 行目の `getTypesOfSchema`（@angular-devkit/core）が、`type` と `oneOf`・`anyOf` の枝から型の集合を作り、194 行目からそれを CLI で受けられるものに絞ります。boolean・number・string はそのまま、array は 201 行目で `current.items` の型を見て、object は 203 行目で「値が string の map」のときだけ残ります。

📄 `angular-cli/packages/angular/cli/src/command-builder/utilities/json-schema.ts` L150–178 （▶ の行: 151, 155, 159, 164, 171）

```ts
150 │ function isSupportedArrayItemSchema(schema: json.JsonObject): boolean {
151 ▶   if (typeof schema.type === 'string' && isSupportedPrimitiveType(schema.type)) {
152 │     return true;
153 │   }
154 │ 
155 ▶   if (json.isJsonArray(schema.enum)) {
156 │     return true;
157 │   }
158 │ 
159 ▶   if (json.isJsonArray(schema.items)) {
160 │     return schema.items.some((item) => isJsonObject(item) && isSupportedArrayItemSchema(item));
161 │   }
162 │ 
163 │   if (
164 ▶     json.isJsonArray(schema.oneOf) &&
165 │     schema.oneOf.some((item) => isJsonObject(item) && isSupportedArrayItemSchema(item))
166 │   ) {
167 │     return true;
168 │   }
169 │ 
170 │   if (
171 ▶     json.isJsonArray(schema.anyOf) &&
172 │     schema.anyOf.some((item) => isJsonObject(item) && isSupportedArrayItemSchema(item))
173 │   ) {
174 │     return true;
175 │   }
176 │ 
177 │   return false;
178 │ }
```

201 行目が渡すのは**そのプロパティの**`items` です。記録の `hosts` は `oneOf: [{type: boolean}, {type: array, items: …}]` で、`items` は oneOf の枝の中にあり、プロパティの直下にはありません。だから array は捨てられ、`--help` は `[boolean]` だけでした。`--hosts example.com` と打つと `hosts: true` になり、`example.com` は位置引数の `second` に入りました。本物の builder でも同じで、`ng serve --help` の `--allowed-hosts` は `[boolean]` です（dev-server の schema は `oneOf` の中に array を持つ）。main の 7ee5f905a8（2026-11-11、`fix(@angular/cli): support array options defined in oneOf schemas`、22.3.0）が、oneOf の枝の `items` も見るように直しました。

## 2. 1 つのオプションの中身：default・enum・alias・required

📄 `angular-cli/packages/angular/cli/src/command-builder/utilities/json-schema.ts` L346–385 （▶ の行: 346–349, 351, 353–355, 358, 360, 365–366, 368, 370, 373, 375, 377–378）

```ts
346 ▶     const [type] = types;
347 ▶     const $default = current.$default;
348 ▶     const $defaultIndex =
349 ▶       isJsonObject($default) && $default['$source'] === 'argv' ? $default['index'] : undefined;
350 │     const positional: number | undefined =
351 ▶       typeof $defaultIndex === 'number' ? $defaultIndex : undefined;
352 │ 
353 ▶     let required = json.isJsonArray(schema.required) && schema.required.includes(name);
354 ▶     if (required && interactive && current['x-prompt']) {
355 ▶       required = false;
356 │     }
357 │ 
358 ▶     const visible = current.visible !== false;
359 │     const xDeprecated = current['x-deprecated'];
360 ▶     const enumValues = getEnumValues(current);
361 │ 
362 │     const option: Option = {
363 │       name,
364 │       description: String(current.description ?? ''),
365 ▶       default: getDefaultValue(current, type),
366 ▶       choices: enumValues?.length ? enumValues : undefined,
367 │       required,
368 ▶       alias: getAliases(current),
369 │       format: typeof current.format === 'string' ? current.format : undefined,
370 ▶       hidden: !!current.hidden || !visible,
371 │       userAnalytics:
372 │         typeof current['x-user-analytics'] === 'string' ? current['x-user-analytics'] : undefined,
373 ▶       deprecated: xDeprecated === true || typeof xDeprecated === 'string' ? xDeprecated : undefined,
374 │       positional,
375 ▶       ...(type === 'object'
376 │         ? {
377 ▶             type: 'array',
378 ▶             itemValueType: 'string',
379 │           }
380 │         : {
381 │             type,
382 │           }),
383 │     };
384 │ 
385 │     options.push(option);
```

1. **346 行目：型は最初の 1 つ**

   `[type] = types` なので、boolean と string を両方許す schema でも yargs には最初の 1 つで登録します。
2. **347〜351 行目：`$default` の `argv` は位置引数**

   `{ "$source": "argv", "index": 0 }` なら `positional: 0` です。記録の `--help` の 1 行目は `ng g …:opts [name] [second]` でした。`$source: "projectName"` は CLI の側では何もせず、schematic の実行のときに schema の登録簿が埋めます（[ng generate component の章](../cli/15-schematics-component.md)）。
3. **353〜356 行目：`required` と `x-prompt`**

   `required` に名前があっても、対話でき（`interactive`）`x-prompt` があれば `false` にします。聞けば埋まるからです。
4. **358・360・365・368 行目**

   `visible: false` は `hidden` に、enum は `choices` に、default と alias はそれぞれ下の関数で決めます。
5. **375〜382 行目：key=value の map**

   object（値が string の map）は yargs には `array` で登録し、`itemValueType: 'string'` の印を付けます（3 節で object に組み直す）。

📄 `angular-cli/packages/angular/cli/src/command-builder/utilities/json-schema.ts` L215–250 （▶ の行: 218–219, 222, 229, 233, 239）

```ts
215 │ function getEnumValues(
216 │   current: json.JsonObject,
217 │ ): ReadonlyArray<string | number | true> | undefined {
218 ▶   if (json.isJsonArray(current.enum)) {
219 ▶     return current.enum.sort() as ReadonlyArray<string | number | true>;
220 │   }
221 │ 
222 ▶   if (isJsonObject(current.items)) {
223 │     const enumValues = getEnumValues(current.items);
224 │     if (enumValues?.length) {
225 │       return enumValues;
226 │     }
227 │   }
228 │ 
229 ▶   if (typeof current.type === 'string' && isSupportedPrimitiveType(current.type)) {
230 │     return [];
231 │   }
232 │ 
233 ▶   const subSchemas =
234 │     (json.isJsonArray(current.oneOf) && current.oneOf) ||
235 │     (json.isJsonArray(current.anyOf) && current.anyOf);
236 │ 
237 │   if (subSchemas) {
238 │     // Find the first enum.
239 ▶     for (const subSchema of subSchemas) {
240 │       if (isJsonObject(subSchema)) {
241 │         const enumValues = getEnumValues(subSchema);
242 │         if (enumValues) {
243 │           return enumValues;
244 │         }
245 │       }
246 │     }
247 │   }
248 │ 
249 │   return [];
250 │ }
```

219 行目で enum を `sort()` します。記録の `style` は schema で `zeta, alpha, mid` の順でしたが、`--help` の `choices` は `"alpha", "mid", "zeta"` でした。`sort()` は配列をその場で並べ替えますが、並べ替えるのは 388 行目の `ɵflatten` が作った写しなので、TTY で `x-prompt` が出したリストは schema の順（zeta、alpha、mid）のままでした。

📄 `angular-cli/packages/angular/cli/src/command-builder/utilities/json-schema.ts` L258–293 （▶ の行: 262, 267–268, 271–272, 275, 284–285, 288–289）

```ts
258 │ function getDefaultValue(
259 │   current: json.JsonObject,
260 │   type: string,
261 │ ): string | number | boolean | unknown[] | undefined {
262 ▶   const defaultValue = current.default;
263 │   if (defaultValue === undefined) {
264 │     return undefined;
265 │   }
266 │ 
267 ▶   if (type === 'array') {
268 ▶     return Array.isArray(defaultValue) && defaultValue.length > 0 ? defaultValue : undefined;
269 │   }
270 │ 
271 ▶   if (typeof defaultValue === type) {
272 ▶     return defaultValue as string | number | boolean;
273 │   }
274 │ 
275 ▶   return undefined;
276 │ }
277 │ 
278 │ /**
279 │  * Gets the aliases for a JSON schema node.
280 │  * @param current The JSON schema node to get the aliases for.
281 │  * @returns An array of aliases.
282 │  */
283 │ function getAliases(current: json.JsonObject): string[] {
284 ▶   if (json.isJsonArray(current.aliases)) {
285 ▶     return [...current.aliases].map(String);
286 │   }
287 │ 
288 ▶   if (current.alias) {
289 ▶     return [String(current.alias)];
290 │   }
291 │ 
292 │   return [];
293 │ }
```

267〜268 行目、array の default は空でない配列のときだけ、271 行目、それ以外は default の JavaScript の型が schema の型と同じときだけ使います。記録の `count`（`type: number`、`default: "3"`）と `tags`（`default: []`）は、`--help` に default が出ませんでした。ただし schematic を走らせると、`count` は `"3"`（文字列）、`tags` は `[]` で渡りました。値を埋めたのは CLI ではなく schema の登録簿の `addUndefinedDefaults`（`schematics-command-module.ts` L138）で、こちらは型を確かめずに schema の default を入れます。`--help` の表と実際に渡る値が食い違う形です。284〜289 行目、別名は `aliases`（配列）が先で、無ければ `alias` を使います。記録の `count` は `-n, --count, --num` でした。

## 3. yargs への登録：default は --help のときだけ

📄 `angular-cli/packages/angular/cli/src/command-builder/command-module.ts` L178–196 （▶ の行: 183, 186–187, 191–192）

```ts
178 │   /**
179 │    * Adds schema options to a command also this keeps track of options that are required for analytics.
180 │    * **Note:** This method should be called from the command bundler method.
181 │    */
182 │   protected addSchemaOptionsToCommand<T>(localYargs: Argv<T>, options: Option[]): Argv<T> {
183 ▶     const optionsWithAnalytics = addSchemaOptionsToCommand(
184 │       localYargs,
185 │       options,
186 ▶       // This should only be done when `--help` is used otherwise default will override options set in angular.json.
187 ▶       /* includeDefaultValues= */ this.context.args.options.help,
188 │     );
189 │ 
190 │     // Record option of analytics.
191 ▶     for (const [name, userAnalytics] of optionsWithAnalytics) {
192 ▶       this.optionsWithAnalytics.set(name, userAnalytics);
193 │     }
194 │ 
195 │     return localYargs;
196 │   }
```

186〜187 行目のコメントのとおり、schema の default を yargs に渡すのは `--help` のときだけです。いつも渡すと、yargs が値を埋めてしまい、`angular.json` の `options` に書いた値をコマンドラインの値として上書きします。記録の builder でも、schema の `count` の default は使われず、`angular.json` の 7 が渡りました。

📄 `angular-cli/packages/angular/cli/src/command-builder/utilities/json-schema.ts` L409–442 （▶ の行: 419, 433, 436–438, 441–442）

```ts
409 │ export function addSchemaOptionsToCommand<T>(
410 │   localYargs: Argv<T>,
411 │   options: Option[],
412 │   includeDefaultValues: boolean,
413 │ ): Map<string, EventCustomDimension> {
414 │   const booleanOptionsWithNoPrefix = new Set<string>();
415 │   const keyValuePairOptions = new Set<string>();
416 │   const optionsWithAnalytics = new Map<string, EventCustomDimension>();
417 │ 
418 │   for (const option of options) {
419 ▶     const {
420 │       default: defaultVal,
421 │       positional,
422 │       deprecated,
423 │       description,
424 │       alias,
425 │       userAnalytics,
426 │       type,
427 │       itemValueType,
428 │       hidden,
429 │       name,
430 │       choices,
431 │     } = option;
432 │ 
433 ▶     let dashedName = strings.dasherize(name);
434 │ 
435 │     // Handle options which have been defined in the schema with `no` prefix.
436 ▶     if (type === 'boolean' && dashedName.startsWith('no-')) {
437 ▶       dashedName = dashedName.slice(3);
438 ▶       booleanOptionsWithNoPrefix.add(dashedName);
439 │     }
440 │ 
441 ▶     if (itemValueType) {
442 ▶       keyValuePairOptions.add(dashedName);
```

📄 `angular-cli/packages/angular/cli/src/command-builder/utilities/json-schema.ts` L443–473 （▶ の行: 445–446, 450–451, 453, 456–459, 463–464, 470–471）

```ts
443 │     }
444 │ 
445 ▶     const sharedOptions: YargsOptions & PositionalOptions = {
446 ▶       alias,
447 │       hidden,
448 │       description,
449 │       deprecated,
450 ▶       choices,
451 ▶       coerce: itemValueType ? coerceToStringMap : undefined,
452 │       // This should only be done when `--help` is used otherwise default will override options set in angular.json.
453 ▶       ...(includeDefaultValues ? { default: defaultVal } : {}),
454 │     };
455 │ 
456 ▶     if (positional === undefined) {
457 ▶       localYargs = localYargs.option(dashedName, {
458 ▶         array: itemValueType ? true : undefined,
459 ▶         type: itemValueType ?? type,
460 │         ...sharedOptions,
461 │       });
462 │     } else {
463 ▶       localYargs = localYargs.positional(dashedName, {
464 ▶         type: type === 'array' || type === 'count' ? 'string' : type,
465 │         ...sharedOptions,
466 │       });
467 │     }
468 │ 
469 │     // Record option of analytics.
470 ▶     if (userAnalytics !== undefined) {
471 ▶       optionsWithAnalytics.set(name, userAnalytics as EventCustomDimension);
472 │     }
473 │   }
```

1. **433 行目：名前を dash の形に**

   `noColor` は `no-color` になります。
2. **436〜439 行目：`no` で始まる boolean**

   yargs の `boolean-negation`（第 1 回の 123 行目）と重ならないよう、`no-` を外した `color` で登録し、名前を覚えておきます。記録の `--help` は `--color` でした。
3. **445〜454 行目：共通の設定**

   別名・hidden・説明・非推奨・choices・map の組み直し（451 行目）・`--help` のときだけの default（453 行目）。2 節で決めた `required` はここに無く、yargs には「必須」として渡りません。記録の `--help` にも `[required]` は出ず、`must` を渡さないと、yargs ではなく schematic の schema の検査が「Data path "" must have required property 'must'.」で止めました。
4. **456〜466 行目：オプションか位置引数か**

   位置引数で array のものは 464 行目で string にします。

📄 `angular-cli/packages/angular/cli/src/command-builder/utilities/json-schema.ts` L475–493 （▶ の行: 476–477, 481–482, 485–486）

```ts
475 │   // Valid key/value options
476 ▶   if (keyValuePairOptions.size) {
477 ▶     localYargs.check(checkStringMap.bind(null, keyValuePairOptions), false);
478 │   }
479 │ 
480 │   // Handle options which have been defined in the schema with `no` prefix.
481 ▶   if (booleanOptionsWithNoPrefix.size) {
482 ▶     localYargs.middleware((options: Arguments) => {
483 │       for (const key of booleanOptionsWithNoPrefix) {
484 │         if (key in options) {
485 ▶           options[`no-${key}`] = !options[key];
486 ▶           delete options[key];
487 │         }
488 │       }
489 │     }, false);
490 │   }
491 │ 
492 │   return optionsWithAnalytics;
493 │ }
```

📄 `angular-cli/packages/angular/cli/src/command-builder/utilities/json-schema.ts` L61–83 （▶ の行: 64, 74–76）

```ts
61 │ function checkStringMap(keyValuePairOptions: Set<string>, args: Arguments): boolean {
62 │   for (const key of keyValuePairOptions) {
63 │     const value = args[key];
64 ▶     if (!Array.isArray(value)) {
65 │       // Value has been parsed.
66 │       continue;
67 │     }
68 │ 
69 │     for (const pair of value) {
70 │       if (pair === undefined) {
71 │         continue;
72 │       }
73 │ 
74 ▶       if (!pair.includes('=')) {
75 ▶         throw new Error(
76 ▶           `Invalid value for argument: ${key}, Given: '${pair}', Expected key=value pair`,
77 │         );
78 │       }
79 │     }
80 │   }
81 │ 
82 │   return true;
83 │ }
```

📄 `angular-cli/packages/angular/cli/src/command-builder/utilities/json-schema.ts` L90–111 （▶ の行: 100–101, 103, 106–107）

```ts
 90 │ function coerceToStringMap(
 91 │   value: (string | undefined)[],
 92 │ ): Record<string, string> | (string | undefined)[] {
 93 │   const stringMap: Record<string, string> = {};
 94 │   for (const pair of value) {
 95 │     // This happens when the flag isn't passed at all.
 96 │     if (pair === undefined) {
 97 │       continue;
 98 │     }
 99 │ 
100 ▶     const eqIdx = pair.indexOf('=');
101 ▶     if (eqIdx === -1) {
102 │       // In the case it is not valid skip processing this option and handle the error in `checkStringMap`
103 ▶       return value;
104 │     }
105 │ 
106 ▶     const key = pair.slice(0, eqIdx);
107 ▶     stringMap[key] = pair.slice(eqIdx + 1);
108 │   }
109 │ 
110 │   return stringMap;
111 │ }
```

map のオプションは、451 行目の `coerce`（`coerceToStringMap`）が `['k=v', 'z=1']` を `{k: 'v', z: '1'}` にします。`=` の無い値があると 101〜103 行目で配列のまま返し、477 行目の `check`（`checkStringMap`）が 64 行目で「まだ配列なら」と見て 75〜77 行目の文を投げます。記録は「Invalid value for argument: env, Given: 'oops', Expected key=value pair」でした。482〜489 行目は 436〜439 行目で外した `no-` を戻す middleware で、`--no-color` は `color: false` を経て `noColor: true` になりました。

📄 `angular-cli/packages/angular/cli/src/command-builder/utilities/normalize-options-middleware.ts` L11–39 （▶ の行: 14–15, 25, 29–30, 32–33, 35）

```ts
11 │ /**
12 │  * A Yargs middleware that normalizes non Array options when the argument has been provided multiple times.
13 │  *
14 ▶  * By default, when an option is non array and it is provided multiple times in the command line, yargs
15 ▶  * will not override it's value but instead it will be changed to an array unless `duplicate-arguments-array` is disabled.
16 │  * But this option also have an effect on real array options which isn't desired.
17 │  *
18 │  * See: https://github.com/yargs/yargs-parser/pull/163#issuecomment-516566614
19 │  */
20 │ export function createNormalizeOptionsMiddleware(localeYargs: Argv): (args: Arguments) => void {
21 │   return (args: Arguments) => {
22 │     // `getOptions` is not included in the types even though it's public API.
23 │     // https://github.com/yargs/yargs/issues/2098
24 │     // eslint-disable-next-line @typescript-eslint/no-explicit-any
25 ▶     const { array } = (localeYargs as any).getOptions();
26 │     const arrayOptions = new Set(array);
27 │ 
28 │     for (const [key, value] of Object.entries(args)) {
29 ▶       if (key !== '_' && Array.isArray(value) && !arrayOptions.has(key)) {
30 ▶         const newValue = value.pop();
31 │         // eslint-disable-next-line no-console
32 ▶         console.warn(
33 ▶           `Option '${key}' has been specified multiple times. The value '${newValue}' will be used.`,
34 │         );
35 ▶         args[key] = newValue;
36 │       }
37 │     }
38 │   };
39 │ }
```

yargs は array でないオプションを 2 回渡されると配列にします。29〜35 行目で、array として登録していないのに配列になったものは最後の値にし、警告を出します。記録は `--count 1 --count 2` で「Option 'count' has been specified multiple times. The value '2' will be used.」、渡った値は 2 でした。

## 4. 並べ方と --json-help

📄 `angular-cli/packages/angular/cli/src/command-builder/utilities/json-schema.ts` L388–401 （▶ の行: 388–389, 392–396, 399）

```ts
388 ▶   const flattenedSchema = await registry.ɵflatten(schema);
389 ▶   json.schema.visitJsonSchema(flattenedSchema, visitor);
390 │ 
391 │   // Sort by positional and name.
392 ▶   return options.sort((a, b) => {
393 ▶     if (a.positional) {
394 ▶       return b.positional ? a.positional - b.positional : a.name.localeCompare(b.name);
395 ▶     } else if (b.positional) {
396 ▶       return -1;
397 │     }
398 │ 
399 ▶     return a.name.localeCompare(b.name);
400 │   });
401 │ }
```

393 行目の `if (a.positional)` は、`positional` が 0 のときも偽になります。位置の 0 番が「位置引数ではない」と扱われ、比べる 2 つの組によって答えが矛盾する比較関数になります。DEMO の「並べ方」は、この比較関数を 44129f66a3 と v22.2.7 の原文から取り出して同じ配列に当てた記録で、44129f66a3 は `alpha(-), preset(0), name(1), path(-)`（位置引数でない `alpha` が先頭）、v22.2.7 は `preset(0), name(1), alpha(-), path(-)` でした。位置引数の順は `ng generate` のコマンドの形（`[name] [second]`）になるので、ずれると位置で渡した値が別の名前に入ります。main の d69dcec313（2026-10-20、`fix(@angular/cli): keep schematic positional arguments in index order`）が `!== undefined` で比べる形に直し、22.2.7 にも入っています。

📄 `angular-cli/packages/angular/cli/src/command-builder/utilities/json-help.ts` L62–101 （▶ の行: 63–64, 66, 73–77, 80, 89, 95, 98）

```ts
 62 │   const usageInstance = internalMethods.getUsageInstance();
 63 ▶   const context = internalMethods.getContext();
 64 ▶   const descriptions = usageInstance.getDescriptions();
 65 │   const groups = localYargsInstance.getGroups();
 66 ▶   const positional = groups[usageInstance.getPositionalGroupName()] as string[] | undefined;
 67 │   const seen = new Set<string>();
 68 │   const hidden = new Set(hiddenOptions);
 69 │   const normalizeOptions: JsonHelpOption[] = [];
 70 │   const allAliases = new Set([...Object.values<string[]>(aliases).flat()]);
 71 │ 
 72 │   // Reverted order of https://github.com/yargs/yargs/blob/971e351705f0fbc5566c6ed1dfd707fa65e11c0d/lib/usage.ts#L419-L424
 73 ▶   for (const [names, type] of [
 74 ▶     [number, 'number'],
 75 ▶     [array, 'array'],
 76 ▶     [string, 'string'],
 77 ▶     [boolean, 'boolean'],
 78 │   ]) {
 79 │     for (const name of names) {
 80 ▶       if (allAliases.has(name) || hidden.has(name) || seen.has(name)) {
 81 │         // Ignore hidden, aliases and already visited option.
 82 │         continue;
 83 │       }
 84 │ 
 85 │       seen.add(name);
 86 │       const positionalIndex = positional?.indexOf(name) ?? -1;
 87 │       const alias = aliases[name];
 88 │ 
 89 ▶       normalizeOptions.push({
 90 │         name,
 91 │         type,
 92 │         deprecated: deprecatedOptions[name],
 93 │         aliases: alias?.length > 0 ? alias : undefined,
 94 │         default: defaultVal[name],
 95 ▶         required: demandedOptions[name],
 96 │         enum: choices[name],
 97 │         description: descriptions[name]?.replace('__yargsString__:', ''),
 98 ▶         positional: positionalIndex >= 0 ? positionalIndex : undefined,
 99 │       });
100 │     }
101 │   }
```

`--json-help` は yargs が覚えている登録を 73〜78 行目の型の順に読み、80 行目で別名と hidden を除いて並べます（angular.dev の CLI の説明はこの出力から作る）。95 行目の `required` は yargs の `demandedOptions` なので、3 節のとおり schema の `required` はここにも出ません。記録の `--json-help` の行は `{"name":"color","type":"boolean"}` のように dash の名前で、`secret`（`visible: false`）はありませんでした。`--json-help` だけを打つと「Missing dependent arguments: json-help -&gt; help」で終了コード 1 です（第 1 回の 130 行目の `implies`）。e2e の help-json.ts も `--help --json-help` の 2 つを付けています（L43・L52）。

## 5. schematic のオプション：4 つの共通のオプションと x-prompt

📄 `angular-cli/packages/angular/cli/src/command-builder/schematics-command-module.ts` L57–96 （▶ の行: 58, 61, 63, 66, 69, 74, 79, 88–89, 91, 95）

```ts
57 │     return argv
58 ▶       .option('interactive', {
59 │         describe: 'Enable interactive input prompts.',
60 │         type: 'boolean',
61 ▶         default: true,
62 │       })
63 ▶       .option('dry-run', {
64 │         describe: 'Run through and reports activity without writing out results.',
65 │         type: 'boolean',
66 ▶         alias: ['d'],
67 │         default: false,
68 │       })
69 ▶       .option('defaults', {
70 │         describe: 'Disable interactive input prompts for options with a default.',
71 │         type: 'boolean',
72 │         default: false,
73 │       })
74 ▶       .option('force', {
75 │         describe: 'Force overwriting of existing files.',
76 │         type: 'boolean',
77 │         default: false,
78 │       })
79 ▶       .strict();
80 │   }
81 │ 
82 │   /** Get schematic schema options.*/
83 │   protected async getSchematicOptions(
84 │     collection: Collection<FileSystemCollectionDescription, FileSystemSchematicDescription>,
85 │     schematicName: string,
86 │     workflow: NodeWorkflow,
87 │   ): Promise<Option[]> {
88 ▶     const schematic = collection.createSchematic(schematicName, true);
89 ▶     const { schemaJson } = schematic.description;
90 │ 
91 ▶     if (!schemaJson) {
92 │       return [];
93 │     }
94 │ 
95 ▶     return parseJsonSchemaToOptions(workflow.registry, schemaJson);
96 │   }
```

`ng generate`・`ng add`・`ng new` の土台です。58〜78 行目の `--interactive`・`--dry-run`（別名 `-d`）・`--defaults`・`--force` は schema に関係なく全部の schematic に付き、79 行目で `strict` にします。88 行目の `createSchematic(name, true)` の 2 つ目は「private の schematic も作る」で、95 行目で 1〜3 節の関数に schema を渡します（3 つ目の `interactive` は省略なので `true`）。

📄 `angular-cli/packages/angular/cli/src/command-builder/schematics-command-module.ts` L166–202 （▶ の行: 166–167, 171–172, 177, 179, 181, 186, 192）

```ts
166 ▶     if (options.interactive !== false && isTTY()) {
167 ▶       workflow.registry.usePromptProvider(async (definitions: Array<schema.PromptDefinition>) => {
168 │         let prompts: typeof import('@inquirer/prompts') | undefined;
169 │         const answers: Record<string, JsonValue> = {};
170 │ 
171 ▶         for (const definition of definitions) {
172 ▶           if (options.defaults && definition.default !== undefined) {
173 │             continue;
174 │           }
175 │ 
176 │           // Only load prompt package if needed
177 ▶           prompts ??= await import('@inquirer/prompts');
178 │ 
179 ▶           switch (definition.type) {
180 │             case 'confirmation':
181 ▶               answers[definition.id] = await prompts.confirm({
182 │                 message: definition.message,
183 │                 default: definition.default as boolean | undefined,
184 │               });
185 │               break;
186 ▶             case 'list':
187 │               if (!definition.items?.length) {
188 │                 continue;
189 │               }
190 │ 
191 │               answers[definition.id] = await (
192 ▶                 definition.multiselect ? prompts.checkbox : prompts.select
193 │               )({
194 │                 message: definition.message,
195 │                 validate: (values) => {
196 │                   if (!definition.validator) {
197 │                     return true;
198 │                   }
199 │ 
200 │                   return definition.validator(Object.values(values).map(({ value }) => value));
201 │                 },
202 │                 default: definition.multiselect ? undefined : definition.default,
```

📄 `angular-cli/packages/angular/cli/src/command-builder/schematics-command-module.ts` L226–262 （▶ の行: 226, 228, 237, 241, 245, 251, 254）

```ts
226 ▶             case 'input': {
227 │               let finalValue: JsonValue | undefined;
228 ▶               answers[definition.id] = await prompts.input({
229 │                 message: definition.message,
230 │                 default: definition.default as string | undefined,
231 │                 async validate(value) {
232 │                   if (definition.validator === undefined) {
233 │                     return true;
234 │                   }
235 │ 
236 │                   let lastValidation: ReturnType<typeof definition.validator> = false;
237 ▶                   for (const type of definition.propertyTypes) {
238 │                     let potential;
239 │                     switch (type) {
240 │                       case 'string':
241 ▶                         potential = String(value);
242 │                         break;
243 │                       case 'integer':
244 │                       case 'number':
245 ▶                         potential = Number(value);
246 │                         break;
247 │                       default:
248 │                         potential = value;
249 │                         break;
250 │                     }
251 ▶                     lastValidation = await definition.validator(potential);
252 │ 
253 │                     // Can be a string if validation fails
254 ▶                     if (lastValidation === true) {
255 │                       finalValue = potential;
256 │ 
257 │                       return true;
258 │                     }
259 │                   }
260 │ 
261 │                   return lastValidation;
262 │                 },
```

`x-prompt` を聞くのは 166 行目の `interactive !== false && isTTY()` のときだけです。記録の実行は TTY でないので、`asked` は聞かれず、`must` と同じく schema の検査で止まりました。expect で疑似端末を作って同じコマンドを打つと、`Which style?` の select（186〜202 行目）と `Asked value?` の input（226 行目）が出て、答えた値が `style: "alpha"`・`asked: "typed"` で渡りました。172 行目の `--defaults` は、default のある質問を飛ばします。`--defaults` を付けた疑似端末の記録では `style` を聞かれず `zeta` でした。237〜259 行目の input は、schema の型の候補を順に試し（241 行目で文字列、245 行目で数）、validator を最初に通った値を使います。

## 6. builder のオプション：project の決め方

📄 `angular-cli/packages/angular/cli/src/command-builder/architect-command-module.ts` L38–66 （▶ の行: 39, 42, 44–45, 49, 57–58, 60–61）

```ts
38 │   async builder(argv: Argv): Promise<Argv<ArchitectCommandArgs>> {
39 ▶     const target = this.getArchitectTarget();
40 │ 
41 │     // Add default builder if target is not in project and a command default is provided
42 ▶     if (this.findDefaultBuilderName && this.context.workspace) {
43 │       for (const [project, projectDefinition] of this.context.workspace.projects) {
44 ▶         const targetDefinition = projectDefinition.targets.get(target);
45 ▶         if (targetDefinition?.builder) {
46 │           continue;
47 │         }
48 │ 
49 ▶         const defaultBuilder = await this.findDefaultBuilderName(projectDefinition, {
50 │           project,
51 │           target,
52 │         });
53 │         if (!defaultBuilder) {
54 │           continue;
55 │         }
56 │ 
57 ▶         if (targetDefinition) {
58 ▶           targetDefinition.builder = defaultBuilder;
59 │         } else {
60 ▶           projectDefinition.targets.set(target, {
61 ▶             builder: defaultBuilder,
62 │           });
63 │         }
64 │       }
65 │     }
66 │ 
```

`ng build` などの土台の `builder` です。42〜65 行目は、`findDefaultBuilderName` を持つコマンド（子のクラスが「このターゲットが無ければこの builder」を決める）について、`angular.json` にターゲットが無いプロジェクトに既定の builder を**メモリの上で**足します（58・60 行目。ファイルには書かない）。

📄 `angular-cli/packages/angular/cli/src/command-builder/architect-command-module.ts` L67–104 （▶ の行: 67, 71–72, 75, 77, 83, 87–89, 94–95, 98, 103）

```ts
 67 ▶     const project = this.getArchitectProject();
 68 │     const { jsonHelp, getYargsCompletions, help } = this.context.args.options;
 69 │ 
 70 │     const localYargs: Argv<ArchitectCommandArgs> = argv
 71 ▶       .positional('project', {
 72 ▶         describe: 'The name of the project to build. Can be an application or a library.',
 73 │         type: 'string',
 74 │         // Hide choices from JSON help so that we don't display them in AIO.
 75 ▶         choices: jsonHelp ? undefined : this.getProjectChoices(),
 76 │       })
 77 ▶       .option('configuration', {
 78 │         describe:
 79 │           `One or more named builder configurations as a comma-separated ` +
 80 │           `list as specified in the "configurations" section in angular.json.\n` +
 81 │           `The builder uses the named configurations to run the given target.\n` +
 82 │           `For more information, see https://angular.dev/reference/configs/workspace-config#alternate-build-configurations.`,
 83 ▶         alias: 'c',
 84 │         type: 'string',
 85 │         // Show only in when using --help and auto completion because otherwise comma seperated configuration values will be invalid.
 86 │         // Also, hide choices from JSON help so that we don't display them in AIO.
 87 ▶         choices:
 88 ▶           (getYargsCompletions || help) && !jsonHelp && project
 89 ▶             ? this.getConfigurationChoices(project)
 90 │             : undefined,
 91 │       })
 92 │       .strict();
 93 │ 
 94 ▶     if (!project) {
 95 ▶       return localYargs;
 96 │     }
 97 │ 
 98 ▶     const schemaOptions = await this.getArchitectTargetOptions({
 99 │       project,
100 │       target,
101 │     });
102 │ 
103 ▶     return this.addSchemaOptionsToCommand(localYargs, schemaOptions);
104 │   }
```

71〜76 行目で `[project]` を位置引数にし、75 行目の `choices` はワークスペースのプロジェクトの名前です。72 行目の説明文「The name of the project to build.」は、`ng test`・`ng serve`・`ng lint` などにも同じ文で出ます。22.2.7 と main の f2d16f75ee はこれを「The name of the project to run the command for.」に直しました。87〜90 行目の `--configuration` の `choices` は `--help` と補完のときだけで、コメントのとおり、いつも付けると `a,b` のようなカンマ区切りが choices にないとして弾かれるからです。94〜96 行目、project が決まらなければ builder の schema のオプションを足さず、98〜103 行目で決まれば足します。

📄 `angular-cli/packages/angular/cli/src/command-builder/architect-command-module.ts` L167–201 （▶ の行: 167, 171, 173, 175–176, 179, 181, 185, 187, 190）

```ts
167 ▶     if (allProjectsForTargetName.length === 0) {
168 │       return undefined;
169 │     }
170 │ 
171 ▶     if (this.multiTarget) {
172 │       // For multi target commands, we always list all projects that have the target.
173 ▶       return allProjectsForTargetName;
174 │     } else {
175 ▶       if (allProjectsForTargetName.length === 1) {
176 ▶         return allProjectsForTargetName;
177 │       }
178 │ 
179 ▶       const maybeProject = getProjectByCwd(workspace);
180 │       if (maybeProject) {
181 ▶         return allProjectsForTargetName.includes(maybeProject) ? [maybeProject] : undefined;
182 │       }
183 │ 
184 │       const { getYargsCompletions, help } = this.context.args.options;
185 ▶       if (!getYargsCompletions && !help) {
186 │         // Only issue the below error when not in help / completion mode.
187 ▶         throw new CommandModuleError(
188 │           'Cannot determine project for command.\n' +
189 │             'This is a multi-project workspace and more than one project supports this command. ' +
190 ▶             `Run "ng ${this.command}" to execute the command for a specific project or change the current ` +
191 │             'working directory to a project directory.\n\n' +
192 │             `Available projects are:\n${allProjectsForTargetName
193 │               .sort()
194 │               .map((p) => `- ${p}`)
195 │               .join('\n')}`,
196 │         );
197 │       }
198 │     }
199 │ 
200 │     return undefined;
201 │   }
```

`getArchitectProject`（L137〜154、boot-architect の章）が使う、ターゲットを持つプロジェクトの一覧です。171 行目、複数のプロジェクトに一度に走らせるコマンド（`multiTarget`）なら全部、175 行目、1 つしか無ければそれ、179〜181 行目、今のディレクトリのプロジェクトがあればそれ、どれでもなければ 185〜196 行目の「Cannot determine project for command.」です。190 行目の文は `Run "ng ${this.command}"` と、`build [project]` のような yargs の書き方をそのまま入れます。

📄 `angular-cli/packages/angular/cli/src/command-builder/architect-base-command-module.ts` L176–204 （▶ の行: 181, 183, 188, 191–193, 199–202）

```ts
176 │   protected async getArchitectTargetOptions(target: Target): Promise<Option[]> {
177 │     const architectHost = this.getArchitectHost();
178 │     let builderConf: string;
179 │ 
180 │     try {
181 ▶       builderConf = await architectHost.getBuilderNameForTarget(target);
182 │     } catch {
183 ▶       return [];
184 │     }
185 │ 
186 │     let builderDesc: NodeModulesBuilderInfo;
187 │     try {
188 ▶       builderDesc = await architectHost.resolveBuilder(builderConf);
189 │     } catch (e) {
190 │       assertIsError(e);
191 ▶       if (e.code === 'MODULE_NOT_FOUND') {
192 ▶         this.warnOnMissingNodeModules();
193 ▶         throw new CommandModuleError(`Could not find the '${builderConf}' builder's node package.`);
194 │       }
195 │ 
196 │       throw e;
197 │     }
198 │ 
199 ▶     return parseJsonSchemaToOptions(
200 ▶       new json.schema.CoreSchemaRegistry(),
201 ▶       builderDesc.optionSchema as json.JsonObject,
202 ▶       true,
203 │     );
204 │   }
```

builder の schema は、181 行目で `angular.json` から builder の名前（`./tools/demo-builder:opts`）を読み、188 行目でパッケージの `builders.json` から schema を引きます。schematic と同じ `parseJsonSchemaToOptions` を、202 行目で `interactive: true` にして呼ぶので、`--help` は記録のとおり schematic とほぼ同じ形でした（共通の 4 つのオプションが無いだけ）。

違うのは 2 つです。1 つ目、`$default` の `argv` のプロパティは `ng run` の `--help` の Arguments に `name`・`second` と出ましたが、`ng run demo-ws:opts posA posB` は「Unknown arguments: posA, posB」でした。`ng run <target>` のコマンドの形に位置が無いのに、463 行目が `positional` で登録するからです。2 つ目、builder に渡った値に `project` と `name` はありませんでした。`$source: "projectName"` と `argv` を埋めるのは schematic の登録簿だけで、builder（Architect）は埋めません。

## 7. memoize：インスタンスをまたいで同じ答え

📄 `angular-cli/packages/angular/cli/src/command-builder/schematics-command-module.ts` L399–429 （▶ の行: 405, 415, 417, 420, 422, 424–425, 427）

```ts
399 │   private getProjectName(): string | undefined {
400 │     const { workspace } = this.context;
401 │     if (!workspace) {
402 │       return undefined;
403 │     }
404 │ 
405 ▶     const projectName = getProjectByCwd(workspace);
406 │     if (projectName) {
407 │       return projectName;
408 │     }
409 │ 
410 │     return undefined;
411 │   }
412 │ 
413 │   private getResolvePaths(collectionName: string): string[] {
414 │     const { workspace, root } = this.context;
415 ▶     if (collectionName[0] === '.') {
416 │       // Resolve relative collections from the location of `angular.json`
417 ▶       return [root];
418 │     }
419 │ 
420 ▶     return workspace
421 │       ? // Workspace
422 ▶         collectionName === DEFAULT_SCHEMATICS_COLLECTION
423 │         ? // Favor __dirname for @schematics/angular to use the build-in version
424 ▶           [__dirname, process.cwd(), root]
425 ▶         : [process.cwd(), root, __dirname]
426 │       : // Global
427 ▶         [__dirname, process.cwd()];
428 │   }
429 │ }
```

schematic の collection を探す場所です。415〜418 行目、`./` で始まる名前（記録の `./tools/demo-schematics/collection.json`）は `angular.json` の場所から、422〜424 行目、`@schematics/angular` は CLI に入っている版（`__dirname`）を先に、ほかは今のディレクトリ・ワークスペース・CLI の順に探します。この結果は 99 行目と 107 行目の `@memoize` を付けたメソッドが使います。

📄 `angular-cli/packages/angular/cli/src/utilities/memoize.ts` L16–45 （▶ の行: 24, 26, 28, 30, 35–37, 40–41）

```ts
16 │ export function memoize<This, Args extends unknown[], Return>(
17 │   target: (this: This, ...args: Args) => Return,
18 │   context: ClassMemberDecoratorContext,
19 │ ) {
20 │   if (context.kind !== 'method' && context.kind !== 'getter') {
21 │     throw new Error('Memoize decorator can only be used on methods or get accessors.');
22 │   }
23 │ 
24 ▶   const cache = new Map<string, Return>();
25 │ 
26 ▶   return function (this: This, ...args: Args): Return {
27 │     for (const arg of args) {
28 ▶       if (!isJSONSerializable(arg)) {
29 │         throw new Error(
30 ▶           `Argument ${isNonPrimitive(arg) ? arg.toString() : arg} is JSON serializable.`,
31 │         );
32 │       }
33 │     }
34 │ 
35 ▶     const key = JSON.stringify(args);
36 ▶     if (cache.has(key)) {
37 ▶       return cache.get(key) as Return;
38 │     }
39 │ 
40 ▶     const result = target.apply(this, args);
41 ▶     cache.set(key, result);
42 │ 
43 │     return result;
44 │   };
45 │ }
```

24 行目の `cache` はデコレーターを付けたメソッドごとに 1 つで、35 行目の鍵は引数だけです。`this` は鍵に入らないので、同じクラスの 2 つのインスタンスで同じ引数を渡すと、2 つ目は 1 つ目の答えを返します。22.2.7 の dist の `memoize` をデコレーターと同じ呼び方で付けた記録では、`/ws-b` のインスタンスが `workflow(/ws-a, x)` を返しました。普通の `ng` の実行では 1 つのコマンドにインスタンスは 1 つなので、表に出る形は見つけていません。30 行目の文は、JSON にできない引数のときに投げるのに「is JSON serializable.」と言います（記録：`Argument [object Map] is JSON serializable.`）。`not` が抜けています。main も同じです。

> **🧪 DEMO — 自作の schematic と builder を本物の ng で動かした記録**
>
> ボタンは、記録用のワークスペース（`demo-ws`、ローカルの @angular/cli 22.2.7）に置いた schematic（`tools/demo-schematics`）と builder（`tools/demo-builder`、同じ schema）を動かした記録を再生します。schematic も builder も、受け取った値を `OPTIONS`・`BUILDER OPTIONS` の 1 行で出すだけです。使った schema は「1」の最後の記録にあります。標準エラーは左に印を付けます。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/ngx-options)

## ここまでの呼び出し（ng g …:opts --help の表ができるまで）

- 👤 `$ ng g ./tools/demo-schematics/collection.json:opts --help` — commands/generate/cli.ts
  - `getSchematicOptions(collection, 'opts', workflow)` — schematics-command-module.ts L83 — *createSchematic(name, true)*
    - `parseJsonSchemaToOptions(registry, schemaJson)` — json-schema.ts L306
      - `registry.ɵflatten(schema)` → `visitJsonSchema` — L388〜389 — *写しの上で歩く*
        - `getSupportedTypes(current)` — L185 — *oneOf の array は L201 で落ちる*
        - `getEnumValues`・`getDefaultValue`・`getAliases` — L215・L258・L283 — *enum は並べ替え、型の違う default は捨てる*
      - `options.sort(…)` — L392 — *44129f66a3 は positional 0 を取り違える*
  - `this.addSchemaOptionsToCommand(localYargs, options)` — command-module.ts L182 — *default は --help のときだけ（L187）*
    - `localYargs.option(dashedName, …)` / `.positional(…)` — json-schema.ts L457・L463 — *required は渡さない*
    - `localYargs.check(checkStringMap)`・`middleware(no- を戻す)` — L477・L482

## テストと直し方

| ファイル | describe › it（行） | 固めている約束 |
| --- | --- | --- |
| `src/command-builder/utilities/json-schema_spec.ts` | `parseJsonSchemaToOptions`（14）› `without required fields in schema`（15）› `type=number`（137）・`type=array, enum`（147）・`type=array, enum in oneOf`（177）・`type=array, anyOf`（208）・`type=string, enum`（233）・`type=object`（249） | 1〜3 節の型の規則。`should add default value to help`（172）は enum の配列の default だけ。oneOf の中の array（items が枝の中）は無い |
| 同上 | `with required positional argument`（291）› `marks the required argument as required`（292） | 2 節の 353 行目。`find` で 1 つずつ見るので 4 節の並べ方は確かめない（22.2.7 で `sorts positional arguments by their index` を足した） |
| `src/utilities/memoize_spec.ts` | `memoize`（11）› `should call method once`（29）ほか、`validate method arguments`（81） | 7 節。インスタンスを 2 つ作る it は無い。82〜116 行目は例外の文を正規表現で見ていて、85 行目の `/Argument \[object Map\] is JSON serializable./` が `not` の抜けた今の文をそのまま固めている |
| `tests/e2e/tests/commands/help/help-json.ts`・`tests/e2e/tests/misc/negated-boolean-options.ts`・`duplicate-command-line-option.ts` | e2e（読んだだけ） | 4 節の `--json-help`、3 節の `no-` と 2 回の指定 |

📄 `走らせたコマンド（2026-11-24）`

```
$ cd ~/angular-research/angular-cli      # 44129f66a3、読むだけ
$ pnpm bazel test //packages/angular/cli:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=parseJsonSchemaToOptions"
$ pnpm bazel test //packages/angular/cli:test --nocache_test_results --test_output=all \
    "--test_arg=--filter=memoize"
（結果は下の段落）
```

手元の bazel で、名前で絞ると `parseJsonSchemaToOptions` は 16 specs・0 failures、`memoize` は 18 specs・0 failures でした（全体は 257 specs）。

直すとしたら、`json-schema.ts` の 445〜454 行目の `sharedOptions` に `demandOption: required` を足すかどうかは、`angular.json` の値で埋まる builder の必須を yargs が先に弾いてしまうので、schematic だけに限る必要があります。271 行目の型の違う default は、`--help` から消すのではなく警告を出すか、`addUndefinedDefaults` と同じ値を見せる方が実際と合います。spec は json-schema\_spec.ts に「number の schema で default が文字列」を足します。`memoize.ts` は 30 行目の文に `not` を足し（memoize\_spec.ts の 82〜116 行目の正規表現も直す）、鍵に `this` を含めるには `WeakMap<This, Map<string, Return>>` にします。spec は memoize\_spec.ts に「2 つのインスタンスで別の答え」を足します。

## 聞かれそうな質問

**Q. schema に `default` を書いたのに `--help` に出ません。**

型が合っていないか（`getDefaultValue` の 271 行目。number に `"3"` など）、空の配列です（268 行目）。それでも schematic には schema の登録簿が `"3"` を入れて渡します（記録）。

**Q. `required` にしたオプションを渡さなくても yargs はエラーにしません。**

`addSchemaOptionsToCommand`（445〜454 行目）が `required` を yargs に渡さないからです。止めるのは schematic を走らせたときの schema の検査で、文は「Data path "" must have required property …」でした。`x-prompt` があれば、TTY のときは聞いて埋めます（353〜356 行目、166 行目）。

**Q. `noColor` という boolean を作ったら `--color` になりました。**

436〜439 行目が `no-` を外して登録し、482〜489 行目の middleware が `--no-color` → `color: false` → `noColor: true` に戻します（記録）。

**Q. `oneOf` で boolean と配列を許すオプションに値の配列を渡せません。**

22.2.x では、`getSupportedTypes` の 201 行目がプロパティの直下の `items` しか見ず、array が落ちて boolean だけになるからです。`ng serve --allowed-hosts` も同じでした。main の 7ee5f905a8（22.3.0）で直っています。

**Q. schema の default を、なぜいつも yargs に渡さないのですか？**

渡すと yargs がコマンドラインの値として埋めてしまい、`angular.json` の `options` を上書きするからです（command-module.ts L186〜187）。記録の builder には `angular.json` の `count: 7` が渡りました。

## 読み終えて

- schema の `properties` の直下で、boolean・number・string・items の型が分かる array・値が string の map だけがオプションになる。型は最初の 1 つ、oneOf の中の array は 22.2.x では落ちる。
- default は `--help` のときだけ yargs に渡し、型の違う default は `--help` からは消えるが、schematic には schema の登録簿が入れる。
- `required` は yargs には渡らず、止めるのは schema の検査。`x-prompt` は TTY で `--interactive` のときだけで、`--defaults` は default のある質問を飛ばす。
- 位置引数の並べ方は 44129f66a3 では 0 番を取り違えた（22.2.7 と main で直り済み）。builder では `$default` の argv と projectName は効かない。
- `@memoize` の cache は引数だけを鍵にし、インスタンスをまたぐ。例外の文は「is JSON serializable.」と `not` が抜けている。

---

← 前: [ng と打ってから：bin/ng・init・command-runner](01-ngx-entry.md)  
次: [angular.json と設定：config・json-file・completion](03-ngx-config.md) →
