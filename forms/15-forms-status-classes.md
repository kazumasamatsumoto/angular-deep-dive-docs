[目次](../README.md) › [フォームの内側](README.md) › 第 15 回 / 全 20 回

# 状態クラス：ng-valid・ng-touched・ng-submitted が付くまで

> NgControlStatus と NgControlStatusGroup のホストバインディングが AbstractControlStatus の getter を読み、getter が \_status・\_touched・\_pristine などの signal を読むことで、zoneless でもクラスが更新される仕組み。ng-pending、ng-submitted が form にだけ付く理由。

angular/angular · 読了 約 11 分 · 基礎 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/forms-status-classes)

---

`[formControl]` を付けた入力欄には、何もしなくても `ng-valid`・`ng-pristine`・`ng-untouched` などのクラスが付き、触ると `ng-touched` に変わります。この章では、そのクラスを付けている `NgControlStatus` / `NgControlStatusGroup` のホストバインディングと、バインディングが読む `AbstractControlStatus` の getter を読みます。getter が control の signal を読んでいるので、OnPush の中でも zoneless でもクラスが更新されること、`ng-submitted` が form にだけ付く理由も、行で確かめます。

読む対象は `packages/forms/src/directives/ng_control_status.ts`（ほぼ全部）と `abstract_control_directive.ts` の先頭、テストは `packages/forms/test/ng_control_status_spec.ts` と `reactive_integration_spec.ts` の `describe('setting status classes')` です。

1. [1. 全体像](01-forms-overview.md)
2. [2. AbstractControl](02-forms-abstract-control.md)
3. [3. updateValueAndValidity](03-forms-update-value-validity.md)
4. [4. Validators](04-forms-validators.md)
5. [5. 非同期の検証](05-forms-async-validators.md)
6. [6. events](06-forms-control-events.md)
7. [7. FormGroup と FormArray](07-forms-form-group-array.md)
8. [8. 型付きフォームと FormBuilder](08-forms-typed-forms.md)
9. [9. ControlValueAccessor](09-forms-value-accessor.md)
10. [10. 双方向の配線](10-forms-setup-control.md)
11. [11. 組み込みの accessor](11-forms-builtin-accessors.md)
12. [12. リアクティブのディレクティブ](12-forms-reactive-directives.md)
13. [13. NgModel と NgForm](13-forms-ng-model.md)
14. [14. 検証のディレクティブ](14-forms-validator-directives.md)
15. **15. 状態クラス**（この章）
16. [16. Signal Forms のスキーマ](16-forms-sf-schema.md)
17. [17. Signal Forms の検証](17-forms-sf-validation.md)
18. [18. 状態ルールと metadata](18-forms-sf-rules-metadata.md)
19. [19. submit と相互運用](19-forms-sf-submit-compat.md)
20. [20. issue と PR を読む](20-forms-issues.md)

## 1. クラスの一覧：ngControlStatusHost

📄 `angular/packages/forms/src/directives/ng_control_status.ts` L74–82 （▶ の行: 75–81）

```ts
74 │ export const ngControlStatusHost = {
75 ▶   '[class.ng-untouched]': 'isUntouched',
76 ▶   '[class.ng-touched]': 'isTouched',
77 ▶   '[class.ng-pristine]': 'isPristine',
78 ▶   '[class.ng-dirty]': 'isDirty',
79 ▶   '[class.ng-valid]': 'isValid',
80 ▶   '[class.ng-invalid]': 'isInvalid',
81 ▶   '[class.ng-pending]': 'isPending',
82 │ };
```

75〜81 行目、7 つのクラスが 7 つの getter に 1 対 1 でつながった、ふつうの `[class.名前]` のホストバインディングです。ホストバインディングは「ディレクティブが付いた要素（ホスト）に対するバインディング」で、テンプレートに `[class.ng-valid]="..."` と書いたのと同じように、その要素があるビューの変更検知のたびに評価されます。特別な仕組みは無く、**getter が何を返すか**と**いつ再評価されるか**だけが問題です。

| クラス | getter | true になるのは |
| --- | --- | --- |
| `ng-valid` / `ng-invalid` | `isValid` / `isInvalid` | status が `VALID` / `INVALID` |
| `ng-pending` | `isPending` | status が `PENDING`（非同期の検証の途中） |
| `ng-pristine` / `ng-dirty` | `isPristine` / `isDirty` | まだ値を変えていない / 入力欄から値を変えた |
| `ng-untouched` / `ng-touched` | `isUntouched` / `isTouched` | まだ blur していない / blur した |
| `ng-submitted` | `isSubmitted` | form が submit された（グループ側だけ。4 節） |

status が `PENDING` の間は、`ng-valid` も `ng-invalid` も付きません。`DISABLED` のときも同じです。

## 2. 誰が付けるか：NgControlStatus と NgControlStatusGroup

📄 `angular/packages/forms/src/directives/ng_control_status.ts` L107–116 （▶ の行: 108–109, 113）

```ts
107 │ @Directive({
108 ▶   selector: '[formControlName],[ngModel],[formControl]',
109 ▶   host: ngControlStatusHost,
110 │   standalone: false,
111 │ })
112 │ export class NgControlStatus extends AbstractControlStatus {
113 ▶   constructor(@Self() cd: NgControl) {
114 │     super(cd);
115 │   }
116 │ }
```

108 行目、`formControlName`・`ngModel`・`formControl` のどれかがある要素に付きます。`ReactiveFormsModule` にも `FormsModule` にも入っているので、モジュールを import するだけで全部の control の要素に付きます。113 行目、`@Self()` で**同じ要素の**`NgControl`（`FormControlDirective` など）を受け取り、親に渡します。

📄 `angular/packages/forms/src/directives/ng_control_status.ts` L130–146 （▶ の行: 131–132, 136–138, 143）

```ts
130 │ @Directive({
131 ▶   selector:
132 ▶     '[formGroupName],[formArrayName],[ngModelGroup],[formGroup],[formArray],form:not([ngNoForm]),[ngForm]',
133 │   // Note: having this object here to ensure that the spread assignment is not considered
134 │   // a side-effect, ending up preserving `ngControlStatusHost` and `ngGroupStatusHost`.
135 │   // Do not move it to a separate const (`ngGroupStatusHost`).
136 ▶   host: {
137 ▶     ...ngControlStatusHost,
138 ▶     '[class.ng-submitted]': 'isSubmitted',
139 │   },
140 │   standalone: false,
141 │ })
142 │ export class NgControlStatusGroup extends AbstractControlStatus {
143 ▶   constructor(@Optional() @Self() cd: ControlContainer) {
144 │     super(cd);
145 │   }
146 │ }
```

グループの側は 131〜132 行目、`formGroupName`・`formArrayName`・`ngModelGroup`・`formGroup`・`formArray`・`<form>`・`ngForm` に付きます。137 行目で同じ 7 つのクラスを広げ、138 行目で `ng-submitted` を 1 つ足します。143 行目は `@Optional() @Self()` の `ControlContainer` です。`<form>` の selector は `form:not([ngNoForm])` なので、`ReactiveFormsModule` だけを使っていて `[formGroup]` を書いていない素の `<form>` にも、このディレクティブは付きます。そのときは `ControlContainer` が無く `null` が渡ります（3 節で、全部 `false` になる）。

## 3. getter の中身：AbstractControlStatus

📄 `angular/packages/forms/src/directives/ng_control_status.ts` L17–47 （▶ の行: 17–20, 22, 30–31, 35, 40–41, 45–46）

```ts
17 ▶ // DO NOT REFACTOR!
18 ▶ // Each status is represented by a separate function to make sure that
19 ▶ // advanced Closure Compiler optimizations related to property renaming
20 ▶ // can work correctly.
21 │ export class AbstractControlStatus {
22 ▶   private _cd: AbstractControlDirective | null;
23 │ 
24 │   constructor(cd: AbstractControlDirective | null) {
25 │     this._cd = cd;
26 │   }
27 │ 
28 │   protected get isTouched() {
29 │     // track the touched signal
30 ▶     this._cd?.control?._touched?.();
31 ▶     return !!this._cd?.control?.touched;
32 │   }
33 │ 
34 │   protected get isUntouched() {
35 ▶     return !!this._cd?.control?.untouched;
36 │   }
37 │ 
38 │   protected get isPristine() {
39 │     // track the pristine signal
40 ▶     this._cd?.control?._pristine?.();
41 ▶     return !!this._cd?.control?.pristine;
42 │   }
43 │ 
44 │   protected get isDirty() {
45 ▶     // pristine signal already tracked above
46 ▶     return !!this._cd?.control?.dirty;
47 │   }
```

1. **22 行目：持っているのはディレクティブだけ**

   2 節で渡された `NgControl` か `ControlContainer` です。control は持たず、毎回 `this._cd?.control` で取り直します。`control` は下の 5 節の `AbstractControlDirective` の abstract getter で、`[formControl]` に渡す control を差し替えても、次の評価で新しい control を読みます。
2. **30 行目：signal を「読むだけ」読む**

   `this._cd?.control?._touched?.()` の戻り値は捨てています。目的は、control の `_touched`（`computed`）を**今の反応のコンテキストの中で読む**ことです。コメントの「track the touched signal」がそれです。
3. **31 行目：値は getter から**

   返す値は `control.touched` から取ります。[第 2 回](02-forms-abstract-control.md)で見たとおり、`touched` の getter は中の signal を `untracked` で読むので、31 行目だけでは依存が作られません。だから 30 行目が要ります。
4. **35 行目・46 行目：反対側は読み直さない**

   `isUntouched` は signal を読まず、`isDirty` は 45 行目のコメントのとおり「pristine はもう上で読んだ」としています。7 つのクラスは 1 と同じホストバインディングの関数の中で続けて評価されるので、どれか 1 つで読めば足ります。
5. **40 行目：pristine も同じ形**

   `_pristine?.()` を読んでから、41 行目で `control.pristine` を返します。

17〜20 行目の「DO NOT REFACTOR!」は、状態ごとに別々の getter にしてあるのは Closure Compiler のプロパティ名の短縮（renaming）を正しく効かせるためだ、という注意です。`getStatus('touched')` のような文字列で引く 1 つの関数にまとめると、短縮された名前と文字列が合わなくなります。

📄 `angular/packages/forms/src/directives/ng_control_status.ts` L49–72 （▶ の行: 51–52, 56, 61–62, 67–70）

```ts
49 │   protected get isValid() {
50 │     // track the status signal
51 ▶     this._cd?.control?._status?.();
52 ▶     return !!this._cd?.control?.valid;
53 │   }
54 │ 
55 │   protected get isInvalid() {
56 ▶     // status signal already tracked above
57 │     return !!this._cd?.control?.invalid;
58 │   }
59 │ 
60 │   protected get isPending() {
61 ▶     // status signal already tracked above
62 ▶     return !!this._cd?.control?.pending;
63 │   }
64 │ 
65 │   protected get isSubmitted() {
66 │     // track the submitted signal
67 ▶     (this._cd as Writable<NgForm | FormGroupDirective> | null)?._submitted?.();
68 ▶     // We check for the `submitted` field from `NgForm` and `FormGroupDirective` classes, but
69 ▶     // we avoid instanceof checks to prevent non-tree-shakable references to those types.
70 ▶     return !!(this._cd as Writable<NgForm | FormGroupDirective> | null)?.submitted;
71 │   }
72 │ }
```

51 行目で `_status` を読み、`isInvalid`（56 行目）と `isPending`（61〜62 行目）は「status はもう読んだ」とします。67 行目と 70 行目は `ng-submitted` 用で、`_cd` を `NgForm` か `FormGroupDirective` と見なして `_submitted?.()` と `submitted` を読みます。68〜69 行目のコメントのとおり、`instanceof` を使わないのは、それらのクラスへの参照を作るとツリーシェイク（使っていないコードを消す処理）で消せなくなるからです。

## 4. ng-submitted が form にだけ付く理由

138 行目のとおり、`ng-submitted` のバインディング自体は `formGroupName` や `formArrayName` の要素にも付いています。しかし 70 行目の `submitted` を持っているのは、submit を受けるディレクティブ、つまり `NgForm` と、`FormGroupDirective`・`FormArrayDirective` の共通の親 `AbstractFormDirective` だけです （どちらも中身は `signal(false)` で、`onSubmit` で `true`、reset で `false`。[第 12 回](12-forms-reactive-directives.md)・[第 13 回](13-forms-ng-model.md)）。`FormGroupName` には `submitted` も `_submitted` も無いので、67 行目の `?.()` は何もせず、70 行目は `!!undefined` で `false` です。input の要素の `NgControlStatus` には、138 行目のバインディングがそもそもありません。

> [!TIP]
> **新卒エンジニアへ**
>
> 「submit したあと、空の必須の欄を赤くしたい」は、form のクラスと子のクラスを CSS でつなぎます。`form.ng-submitted .ng-invalid { ... }`。`ng-submitted` を input に付けるコードは要りません。

## 5. ディレクティブの側の getter：AbstractControlDirective

📄 `angular/packages/forms/src/directives/abstract_control_directive.ts` L30–56 （▶ の行: 37, 43–44, 53–54）

```ts
30 │ export abstract class AbstractControlDirective {
31 │   /**
32 │    * @description
33 │    * A reference to the underlying control.
34 │    *
35 │    * @returns the control that backs this directive. Most properties fall through to that instance.
36 │    */
37 ▶   abstract get control(): AbstractControl | null;
38 │ 
39 │   /**
40 │    * @description
41 │    * Reports the value of the control if it is present, otherwise null.
42 │    */
43 ▶   get value(): any {
44 ▶     return this.control ? this.control.value : null;
45 │   }
46 │ 
47 │   /**
48 │    * @description
49 │    * Reports whether the control is valid. A control is considered valid if no
50 │    * validation errors exist with the current value.
51 │    * If the control is not present, null is returned.
52 │    */
53 ▶   get valid(): boolean | null {
54 ▶     return this.control ? this.control.valid : null;
55 │   }
56 │ 
```

37 行目の `control` は abstract で、`FormControlDirective` なら `[formControl]` に渡したもの、`FormControlName` なら親の form から名前で引いたもの、を返します（第 12 回）。43〜44 行目の `value`、53〜54 行目の `valid` のように、このクラスの getter は「control があればその値、無ければ `null`」を返す薄い転送です。`#name="ngModel"` のようにテンプレートでディレクティブを参照して `name.valid` と書けるのは、この getter があるからです。3 節の `AbstractControlStatus` はこれらを使わず、37 行目の `control` だけを使って control を直接読んでいます。

## 6. なぜ OnPush・zoneless でもクラスが変わるのか

1. **ビューの描画で、ホストバインディングが評価される**

   入力欄があるビュー（この章ならこのコンポーネントのビュー）を描画するとき、Angular はそのビューの「反応のコンシューマ」（signal の依存を記録する入れ物）を有効にしてテンプレートとホストバインディングを評価します （[変更検知の章](../cd/05-cd-signal-consumer.md)）。
2. **3 節の 30・40・51 行目が依存を作る**

   その中で `_touched()`・`_pristine()`・`_status()` が読まれるので、ビューのコンシューマがこの 3 つの signal に依存します。
3. **control の状態が変わると、signal が変わる**

   `markAsTouched()`・`markAsDirty()`・検証による status の変更は、中の signal に `set` します（[第 2 回](02-forms-abstract-control.md)）。
4. **ビューに印が付き、スケジューラが呼ばれる**

   依存していたビューが「描き直しが必要」になり、zoneless のスケジューラに通知が届きます（[signal から描画までの章](../zoneless/07-zoneless-signal-path.md)）。DOM のイベントも `markForCheck` も無い、`setTimeout` の中の `markAsTouched()` や、非同期の検証の完了でも、クラスが更新されます。

## 7. デモ：class 属性を読む

> **🧪 DEMO — 本物の NgControlStatus / NgControlStatusGroup**
>
> このコンポーネントは OnPush で、アプリは zoneless です。入力欄には `required`・`minLength(3)` と、800ms 後に 'admin' だけを拒む非同期の検証を付けています。入力欄と form の class 属性を、描画のあと（`afterEveryRender`）に読んで `ng-` で始まるものだけ表示します。
>
> 「1 秒後に markAsTouched()」は、ボタンを押したあとフォーカスを入力欄に移さずに待ってください。1 秒後、DOM のイベントが何も無いのに `ng-untouched` が `ng-touched` に変わります（6 節）。'admin' では 800ms の間 `ng-pending` が付き、`ng-valid` と `ng-invalid` がどちらも消えます。submit で form に `ng-submitted` が付き、input には付きません（4 節）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/forms-status-classes)

## ここまでの呼び出し

- 👤 `<input [formControl]="c">` — あなたのテンプレート
  - `new NgControlStatus(@Self() NgControl)` — ng\_control\_status.ts L113
- `（描画）ビューのコンシューマの中でホストバインディングを評価` — 変更検知
  - `[class.ng-touched]="isTouched"` — L76
    - `control._touched()` — L30 — *依存を作る*
    - `control.touched` — L31 — *untracked で値だけ*
- 👤 `setTimeout(() => c.markAsTouched())` — あなたのコード
  - `touched の signal に set` — 第 2 回
    - `ビューに印 → スケジューラに通知 → 描画` — zoneless の章 — *クラスが変わる*

## 聞かれそうな質問

**Q. OnPush や zoneless で、ng-touched などのクラスが更新されるのはなぜですか？**

ホストバインディングの getter が、3 節の 30・40・51 行目で control の signal を読んでいるからです。描画のときにビューのコンシューマがその signal に依存するので、`markAsTouched()` などで signal が変わると、ビューに印が付いてスケジューラが動きます（6 節）。逆に言うと、自分のテンプレートで `c.touched` や `c.valid` を読むだけでは依存は作られません（getter が `untracked` なので）。同じビューに状態クラスのバインディングがあれば一緒に描き直されますが、別のコンポーネントのテンプレートで読むときは、`c.events` を購読するなど別の仕組みが要ります（[第 6 回](06-forms-control-events.md)）。

**Q. 「触ったあとで無効のときだけ赤くする」には、自分でクラスを付ける必要がありますか？**

要りません。クラスは独立に付くので、CSS で組み合わせます。`.ng-invalid.ng-touched { border-color: red; }` で「無効で、かつ blur 済み」です （このデモの入力欄もこの CSS です）。submit 後に全部出したいなら `form.ng-submitted .ng-invalid` を足します。どうしても自分のクラス名にしたいときは `[class.has-error]="c.invalid && c.touched"` と書けますが、上の質問のとおり、この式自体は signal の依存を作りません。同じ要素に `NgControlStatus` が付いているので一緒に描き直される、という前提に立った書き方です。

**Q. ng-pending の CSS は、いつ効きますか？**

control の status が `PENDING` の間、つまり非同期の検証が結果を返すまでです（[第 5 回](05-forms-async-validators.md)）。81 行目の `isPending` は 62 行目で `control.pending` を返し、依存は 51 行目の `_status` で取られています。その間は `ng-valid` も `ng-invalid` も付かないので、`.ng-invalid` だけで赤くしていると、検証中は赤が消えます。「検証中」の表示は `.ng-pending` に付けます（デモの入力欄は点線の枠になります）。グループの要素にも、子のどれかが `PENDING` ならグループ自身が `PENDING` になるので付きます。

**Q. 素の &lt;form&gt; にクラスが付かないのはなぜですか？**

`ReactiveFormsModule` だけを使い、`[formGroup]` を書いていない `<form>` には、2 節の 132 行目の selector で `NgControlStatusGroup` は付きますが、143 行目の `ControlContainer` が見つからず `null` になります。3 節の getter は全部 `this._cd?.` から読む（`_cd` が `null` なら `undefined`）ので、`!!` ですべて `false` を返し、クラスは 1 つも付きません。`FormsModule` を import していれば、`<form>` に `NgForm` が自動で付くので、クラスが付きます。

## テストと直し方

状態クラスのテストは 2 か所です。1 つは、この章の 6 節そのものを確かめる `ng_control_status_spec.ts` です。

📄 `angular/packages/forms/test/ng_control_status_spec.ts` L13–42 （▶ の行: 13–19, 30, 32, 34, 36, 38, 40）

```ts
13 ▶ describe('status host binding classes', () => {
14 ▶   it('work in OnPush components', async () => {
15 ▶     @Component({
16 ▶       selector: 'test-cmp',
17 ▶       template: `<input type="text" [formControl]="control" />`,
18 ▶       imports: [FormsModule, ReactiveFormsModule],
19 ▶     })
20 │     class App {
21 │       control = new FormControl('old value', [Validators.required]);
22 │     }
23 │ 
24 │     const fixture = TestBed.createComponent(App);
25 │     await fixture.whenStable();
26 │     expect(fixture.nativeElement.innerHTML).toContain('ng-valid');
27 │     expect(fixture.nativeElement.innerHTML).toContain('ng-untouched');
28 │     expect(fixture.nativeElement.innerHTML).toContain('ng-pristine');
29 │ 
30 ▶     fixture.componentInstance.control.setValue(null);
31 │     await fixture.whenStable();
32 ▶     expect(fixture.nativeElement.innerHTML).toContain('ng-invalid');
33 │ 
34 ▶     fixture.debugElement.query((x) => x.name === 'input').triggerEventHandler('blur');
35 │     await fixture.whenStable();
36 ▶     expect(fixture.nativeElement.innerHTML).toContain('ng-touched');
37 │ 
38 ▶     fixture.componentInstance.control.reset();
39 │     await fixture.whenStable();
40 ▶     expect(fixture.nativeElement.innerHTML).toContain('ng-untouched');
41 │   });
42 │ });
```

14 行目の名前は「OnPush のコンポーネントで動く」ですが、15〜19 行目の `@Component` には `changeDetection` がありません。v22 では何も書かなければ OnPush です（`ChangeDetectionStrategy` の定義のコメントに「OnPush is enabled by default」とあります）。30 行目の `setValue(null)`、34 行目の `blur`、38 行目の `reset()` のあと、`markForCheck` を呼ばずに 32・36・40 行目でクラスを確かめています。

もう 1 つは `reactive_integration_spec.ts` の `describe('setting status classes')`（10 本）で、4 節を確かめる it がこれです。

📄 `angular/packages/forms/test/reactive_integration_spec.ts` L1888–1922 （▶ の行: 1888–1891, 1906–1908, 1910, 1913–1915, 1917, 1919–1921）

```ts
1888 ▶     it('should not assign `ng-submitted` class to elements with `formArrayName`', async () => {
1889 ▶       // Since element with the `formArrayName` can not represent top-level forms (can only be
1890 ▶       // inside other elements), this test verifies that these elements never receive
1891 ▶       // `ng-submitted` CSS class even when they are located inside submitted form.
1892 │       const fixture = initTest(FormArrayComp);
1893 │       const cityArray = new FormArray([new FormControl('SF'), new FormControl('NY')]);
1894 │       const form = new FormGroup({cities: cityArray});
1895 │       fixture.componentInstance.form = form;
1896 │       fixture.componentInstance.cityArray = cityArray;
1897 │       await fixture.whenStable();
1898 │ 
1899 │       const [loginInput, passwordInput] = fixture.debugElement
1900 │         .queryAll(By.css('input'))
1901 │         .map((el) => el.nativeElement);
1902 │       const arrEl = fixture.debugElement.query(By.css('div')).nativeElement;
1903 │       const formEl = fixture.debugElement.query(By.css('form')).nativeElement;
1904 │ 
1905 │       expect(passwordInput).toBeDefined();
1906 ▶       expect(sortedClassList(loginInput)).not.toContain('ng-submitted');
1907 ▶       expect(sortedClassList(arrEl)).not.toContain('ng-submitted');
1908 ▶       expect(sortedClassList(formEl)).not.toContain('ng-submitted');
1909 │ 
1910 ▶       dispatchEvent(formEl, 'submit');
1911 │       await fixture.whenStable();
1912 │ 
1913 ▶       expect(sortedClassList(loginInput)).not.toContain('ng-submitted');
1914 ▶       expect(sortedClassList(arrEl)).not.toContain('ng-submitted');
1915 ▶       expect(sortedClassList(formEl)).toContain('ng-submitted');
1916 │ 
1917 ▶       dispatchEvent(formEl, 'reset');
1918 │       await fixture.whenStable();
1919 ▶ 
1920 ▶       expect(sortedClassList(loginInput)).not.toContain('ng-submitted');
1921 ▶       expect(sortedClassList(arrEl)).not.toContain('ng-submitted');
1922 │       expect(sortedClassList(formEl)).not.toContain('ng-submitted');
```

1910 行目で form に `submit` を起こすと、1915 行目で form にだけ `ng-submitted` が付き、1913〜1914 行目で input と `formArrayName` の div には付かない。1917 行目の `reset` で 1921 行目、form からも消えることを確かめます。

📄 `ターミナル（../angular で実行）`

```
$ pnpm bazel test //packages/forms/test:test \
    --test_arg=--filter="status host binding classes|setting status classes" --test_output=all
```

- `--filter` は正規表現なので、`|` で 2 つの describe をまとめて指定できます。describe と it を数えると、`status host binding classes` が 1 本、`setting status classes` が 10 本で、合わせて 11 本です。2026-11-01 に走らせると `Ran 11 of 1153 specs` / `11 specs, 0 failures` で通りました。手元でも、まず Ran の数を確かめてください。0 本なら名前の打ち間違いです。
- 直す場所の入口: クラスとバインディングは `ng_control_status.ts` の `AbstractControlStatus` と `ngControlStatusHost`。signal 側は `abstract_model.ts` の `_touched`・`_pristine`・`_status`（第 2 回）。足すテストは、zoneless・OnPush での更新なら `ng_control_status_spec.ts`、クラスの組み合わせなら `describe('setting status classes')` です。
- 「signal を読む 1 行（30・40・51・67 行目）を消すと、どのテストが落ちるか」を手元で試すと、6 節の仕組みが体で分かります。試したら必ず戻します（[テストを書いて壊して戻す回](../contrib/07-contrib-writing-a-test.md)）。PR は出さず、issue を読むときの手がかりにとどめます（[第 20 回](20-forms-issues.md)）。

## 読み終えて

- 状態クラスは、`NgControlStatus`（control の要素）と `NgControlStatusGroup`（グループと form）の、7 + 1 個のふつうの `[class.x]` ホストバインディング。
- getter は control の `_touched`・`_pristine`・`_status` を読んで依存を作り、値は `untracked` の getter から取る。だから OnPush でも zoneless でも更新される。
- `ng-submitted` は、`submitted` を持つ `NgForm` と `AbstractFormDirective` の要素にだけ実際に付く。
- `ng-pending` の間は `ng-valid` も `ng-invalid` も付かない。見た目は CSS のクラスの組み合わせで決める。

---

← 前: [検証のディレクティブ：required 属性が Validators になるまで](14-forms-validator-directives.md)  
次: [Signal Forms のスキーマ：schema・apply・applyWhen が作るロジックの木](16-forms-sf-schema.md) →
