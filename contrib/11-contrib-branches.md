[目次](../README.md) › [コントリビュートの道](README.md) › 第 11 回 / 全 15 回

# ブランチとリリース：main・パッチのブランチ・target ラベル

> branches-and-versioning.md の main と 22.1.x のような版のブランチ、リリースの列車（next・rc・latest）と、ng-dev が各ブランチの package.json の version から今の列車を決める仕組み。target: patch / minor / major / rc / lts のどれを選ぶかで変更がどのブランチに入るか（ng-dev のコードと手引きの食い違いも）、feat や破壊的変更を弾く検査、CHANGELOG に出る形、セマンティックバージョニングと破壊的変更の時期、LTS と非推奨（deprecation）の方針。

angular/angular · 読了 約 12 分 · 中核 · [サイトで読む（デモが動きます）](https://angular-deep-dive-cyan.vercel.app/chapter/contrib-branches)

---

あなたの修正は main に入るだけでは終わりません。`target: patch` が付いていれば、いま npm で `latest` として配られている版のブランチにも cherry-pick され、数日後のパッチ版として利用者に届きます。この章では、Angular のブランチの名前の規則、リリースの列車（next・rc・latest）、`target:` ラベルごとに「どのブランチに入り、どの版で出るか」を、手引きの文章と、それを実際に決めている ng-dev のコードの両方で確かめます。

読む対象は `contributing-docs/branches-and-versioning.md`、`contributing-docs/triage-and-labelling.md` の PR Target の節、`adev/src/content/reference/releases.md`、`.ng-dev/release.mjs`、`CHANGELOG.md`、`package.json`、それに `node_modules/@angular/ng-dev/bundles/` の `cli.mjs` と `chunk-U7PAJR6D.mjs`（ng-dev の本体）です。

1. [1. 全体像](01-contrib-overview.md)
2. [2. リポジトリの地図](02-contrib-repo-map.md)
3. [3. 手元の準備](03-contrib-setup.md)
4. [4. Bazel の読み方](04-contrib-bazel.md)
5. [5. テストを走らせる](05-contrib-run-tests.md)
6. [6. spec の読み方](06-contrib-reading-specs.md)
7. [7. テストを書く](07-contrib-writing-a-test.md)
8. [8. 公開 API と golden](08-contrib-public-api.md)
9. [9. コミットメッセージ](09-contrib-commit-messages.md)
10. [10. PR が通るまで](10-contrib-pr-flow.md)
11. **11. ブランチとリリース**（この章）
12. [12. issue の仕分け](12-contrib-triage.md)
13. [13. コードの書き方](13-contrib-coding-standards.md)
14. [14. 手元で確かめる](14-contrib-debugging.md)
15. [15. 最初の PR](15-contrib-first-pr.md)

## 0. 全体の流れ

1. **ブランチは 2 種類**

   `main`（次の版のプレリリース）と、`22.2.x` のような版のブランチ（1〜2 節）。
2. **どれが「いま」かは package.json の version で決まる**

   ng-dev は各ブランチの package.json を読んで、next・rc・latest の 3 つの列車を見つける（3 節）。
3. **PR には target: ラベルを 1 つ**

   ラベルと列車から、入れるブランチの一覧が決まる（4 節）。
4. **コミットの種類で弾かれる**

   `feat` を patch に、破壊的変更を minor に、は道具が止める（5 節）。
5. **CHANGELOG に出る**

   main の版と、パッチの版の両方の節に同じ修正が載る（6 節）。

## 1. npm のタグとブランチの名前

📄 `angular/contributing-docs/branches-and-versioning.md` L7–27 （▶ の行: 14–16, 20–21, 23–24, 26–27）

```md
 7 │ ## Distribution tags on npm
 8 │ 
 9 │ Angular's branching relates directly to versions published on npm. We will reference these [npm
10 │ distribution tags](https://docs.npmjs.com/cli/v6/commands/npm-dist-tag#purpose) throughout:
11 │ 
12 │ | Tag     | Description                                                                       |
13 │ | ------- | --------------------------------------------------------------------------------- |
14 ▶ | latest  | The most recent stable version.                                                   |
15 ▶ | next    | The most recent pre-release version of Angular for testing. May not always exist. |
16 ▶ | v\*-lts | The most recent LTS release for the specified version, such as `v9-lts`.          |
17 │ 
18 │ ## Branch naming
19 │ 
20 ▶ Angular's main branch is `main`. This branch always represents the absolute latest changes. The
21 ▶ code on `main` always represents a pre-release version, often published with the `next` tag on npm.
22 │ 
23 ▶ For each minor and major version increment, a new branch is created. These branches use a naming
24 ▶ scheme matching `\d+\.\d+\.x` and receive subsequent patch changes for that version range. For
25 │ example, the `10.2.x` branch represents the latest patch changes for subsequent releases starting
26 ▶ with `10.2.`. The version tagged on npm as `latest` will always correspond to such a branch,
27 ▶ referred to as the **active patch branch**.
```

npm には版のほかに「タグ」があり、`npm install @angular/core` で入るのは 14 行目の `latest` の版です。15 行目の `next` はプレリリース、16 行目の `v*-lts` は長期サポート中の古い版。20〜21 行目、`main` は常に**プレリリース**の版を表し、`next` タグで公開されます。23〜24 行目、minor か major が上がるたびに `22.2.x` のような名前（`\d+\.\d+\.x`）のブランチが作られ、その版の範囲のパッチを受け取ります。26〜27 行目、npm の `latest` に対応するブランチが**active patch branch**（いまのパッチのブランチ）です。

📄 `angular/package.json` L1–10 （▶ の行: 3）

```json
 1 │ {
 2 │   "name": "angular-srcs",
 3 ▶   "version": "22.2.0-next.7",
 4 │   "private": true,
 5 │   "description": "Angular - a web framework for modern web apps",
 6 │   "homepage": "https://github.com/angular/angular",
 7 │   "bugs": "https://github.com/angular/angular/issues",
 8 │   "license": "MIT",
 9 │   "packageManager": "pnpm@12.3.4",
10 │   "engines": {
```

このサイトが読んでいる clone（2026-09-09 の main）の 3 行目は `22.2.0-next.7`。`-next.7` が付いているので、21 行目のとおりプレリリースです。同じ日に 22.1.x のブランチから `22.1.6` が出ていて、これがそのときの `latest` でした（6 節の CHANGELOG）。このマシンには 2026-10-30 に fetch した refs もあるので、「いま」も読み取れます。

📄 `~/angular-research/angular（読み取りだけのコマンド）`

```
$ git show origin/main:package.json | grep '"version"'
  "version": "22.3.0-next.3",
$ git branch -r | grep -E '/[0-9]+\.[0-9]+\.x$' | sort -V | tail -4
  origin/21.2.x
  origin/22.0.x
  origin/22.1.x
  origin/22.2.x
$ git show origin/22.2.x:package.json | grep '"version"'
  "version": "22.2.4",
$ git for-each-ref --sort=-creatordate --format='%(refname:short) %(creatordate:short)' refs/tags | head -4
v22.3.0-next.3 2026-10-29
v22.2.4 2026-10-29
v22.2.3 2026-10-14
v22.3.0-next.2 2026-10-14
```

10 月 30 日の時点では、main は `22.3.0-next.3`、いまのパッチのブランチは `22.2.x`（`22.2.4`）に進んでいます。この 2 か月の間に何が起きたかが、次の節の「列車」です。

## 2. リリースの列車：next → rc → latest

📄 `angular/contributing-docs/branches-and-versioning.md` L29–50 （▶ の行: 31, 35–38, 40, 42, 47）

```md
29 │ ## Major releases lifecycle
30 │ 
31 ▶ Angular releases a major version roughly every twelve months. Following a major release, we move
32 │ through a consistent lifecycle to the next major release, and repeat. At a high level, this
33 │ process proceeds as follows:
34 │ 
35 ▶ - A major release occurs. The `main` branch now represents the next minor version.
36 ▶ - Eight weeks later, a minor release occurs. The `main` branch now represents the next minor
37 ▶   version. This process repeats 4 times.
38 ▶ - Eight weeks later, the last minor release occurs. The `main` branch now represents the next major
39 │   version.
40 ▶ - Three months later, a major release occurs and the process repeats.
41 │ 
42 ▶ NOTE: Until Angular v22, Angular had a major release every six months, with 1-3 minor releases for each major release.
43 │ 
44 │ ### Example
45 │ 
46 │ - Angular publishes `22.0.0`. At this point in time, the `main` branch represents `22.1.0`.
47 ▶ - Eight weeks later, we publish `22.1.0` and `main` represents `22.2.0`.
48 │ - The last step repeats until 22.4.0 is published and `main` represents `22.5.0`.
49 │ - Eight weeks later, we publish `22.5.0` and `main` represents `23.0.0`.
50 │ - Three months later, this cycle repeats with the publication of `23.0.0`.
```

31 行目、major はおよそ 12 か月ごと。35〜37 行目、そのあと 8 週ごとに minor を 4 回、38〜39 行目でもう 1 回の minor のあと main は次の major になり、40 行目、3 か月後に major が出ます。42 行目、v22 より前は 6 か月ごとの major でした。実際のタグの日付は `v22.0.0` が 2026-06-03、`v22.1.0` が 07-29、`v22.2.0` が 09-23 で、47 行目の例どおり 8 週ずつです。

📄 `angular/contributing-docs/branches-and-versioning.md` L52–66 （▶ の行: 57–62, 64–65）

```md
52 │ ### Feature freeze and release candidates
53 │ 
54 │ Before publishing minor and major versions as `latest` on npm, they go through a feature freeze and
55 │ a release candidate (RC) phase.
56 │ 
57 ▶ **Feature freeze** means that `main` is forked into a branch for a specific version, with no
58 ▶ additional features permitted before releasing as `latest` to npm. This branch becomes the **active
59 ▶ RC branch**. Upon branching, the `main` branch increments to the next minor or major pre-release
60 ▶ version. One week after feature freeze, the first RC is published with the `next` tag on npm from
61 ▶ the active RC branch. Patch bug fixes continue to merge into `main`, the active RC branch, and
62 ▶ the active patch branch during this entire period.
63 │ 
64 ▶ One to three weeks after publishing the first RC, the active RC branch is published as `latest` on
65 ▶ npm and the branch becomes the active patch branch. At this point there is no active RC branch until
66 │ the next minor or major release.
```

1. **57〜59 行目：feature freeze**

   main から版のブランチを切り、それが **active RC branch** になる。このブランチにはもう新機能を入れない。
2. **59〜60 行目：main は次へ**

   切った直後に main の版は次の minor か major のプレリリースに上がる。
3. **60〜61 行目：最初の RC**

   freeze の 1 週間後に、RC のブランチから `-rc.0` を `next` タグで出す。
4. **61〜62 行目：その間もバグ修正は 3 本に入る**

   main・RC のブランチ・いまのパッチのブランチ。
5. **64〜65 行目：正式版**

   RC から 1〜3 週間後に `latest` として公開し、RC のブランチがそのまま新しいパッチのブランチになる。RC のブランチは次の freeze まで無い。

22.2 の列車を git の記録で追うとこうなります（release: で始まるコミットとタグの日付）。

📄 `git log（origin/main と origin/22.2.x）`

```
2026-09-09  main      release: cut the v22.2.0-next.7 release
2026-09-16  22.2.x    release: cut the v22.2.0-rc.0 release        ← 22.2.x の最初のコミット
2026-09-16  main      release: bump the next branch to v22.3.0-next.0
2026-09-23  22.2.x    release: cut the v22.2.0 release             ← 22.2.x が latest に
2026-09-30  main      v22.3.0-next.0 のタグ
2026-10-29  22.2.x    release: cut the v22.2.4 release
```

9 月 16 日に 22.2.x を切ると同時に rc.0 を出し、同じ日に main を `22.3.0-next.0` に上げています（手引きの「freeze の 1 週間後に RC」より早い）。9 月 23 日に 22.2.0 を出して、22.2.x がいまのパッチのブランチになりました。この日に 22.1.x から出た `22.1.8` が、22.1 の最後のパッチです。

## 3. ng-dev は「いま」をどう知るか

手引きの言葉の「active patch branch」や「active RC branch」は、マージの道具の中では次のコードで見つけられます。

📄 `angular/node_modules/@angular/ng-dev/bundles/chunk-U7PAJR6D.mjs` L24325–24356 （▶ の行: 24327–24328, 24345–24346, 24350–24351）

```js
24325 │ async function fetchActiveReleaseTrains(repo) {
24326 │   const nextBranchName = repo.nextBranchName;
24327 ▶   const { version: nextVersion } = await getVersionInfoForBranch(repo, nextBranchName);
24328 ▶   const next = new ReleaseTrain(nextBranchName, nextVersion);
24329 │   const majorVersionsToFetch = [];
24330 │   const checks = {
24331 │     canHaveExceptionalMinor: () => false,
24332 │     isValidReleaseCandidateVersion: () => false,
24333 │     isValidExceptionalMinorVersion: () => false
24334 │   };
24335 │   if (nextVersion.minor === 0) {
24336 │     majorVersionsToFetch.push(nextVersion.major - 1, nextVersion.major - 2);
24337 │     checks.isValidReleaseCandidateVersion = (v) => v.major === nextVersion.major - 1;
24338 │     checks.canHaveExceptionalMinor = (rc) => rc === null || rc.isMajor;
24339 │     checks.isValidExceptionalMinorVersion = (v, rc) => v.major === (rc === null ? nextVersion.major : rc.version.major) - 1;
24340 │   } else if (nextVersion.minor === 1) {
24341 │     majorVersionsToFetch.push(nextVersion.major, nextVersion.major - 1);
24342 │     checks.isValidReleaseCandidateVersion = (v) => v.major === nextVersion.major;
24343 │     checks.canHaveExceptionalMinor = (rc) => rc !== null && rc.isMajor;
24344 │     checks.isValidExceptionalMinorVersion = (v, rc) => v.major === rc.version.major - 1;
24345 ▶   } else {
24346 ▶     majorVersionsToFetch.push(nextVersion.major);
24347 │     checks.isValidReleaseCandidateVersion = (v) => v.major === nextVersion.major;
24348 │     checks.canHaveExceptionalMinor = () => false;
24349 │   }
24350 ▶   const branches = await getBranchesForMajorVersions(repo, majorVersionsToFetch);
24351 ▶   const { latest, releaseCandidate, exceptionalMinor } = await findActiveReleaseTrainsFromVersionBranches(repo, next, branches, checks);
24352 │   if (latest === null) {
24353 │     throw Error(`Unable to determine the latest release-train. The following branches have been considered: [${branches.map((b) => b.name).join(", ")}]`);
24354 │   }
24355 │   return new ActiveReleaseTrains({ releaseCandidate, next, latest, exceptionalMinor });
24356 │ }
```

24327 行目、まず main（`nextBranchName`）の package.json の version を GitHub から読みます。1 節の 3 行目の値がここに入ります。main の minor が 2 以上なら（24345〜24346 行目）、同じ major の版のブランチだけを集めます（22.2.0-next.7 なら 22 系）。24350 行目でそのブランチの一覧を取り、24351 行目でそれぞれの役を決めます。

📄 `angular/node_modules/@angular/ng-dev/bundles/chunk-U7PAJR6D.mjs` L24369–24401 （▶ の行: 24369, 24371, 24385, 24395, 24398–24399）

```js
24369 ▶     const { version, isExceptionalMinor } = await getVersionInfoForBranch(repo, name);
24370 │     const releaseTrain = new ReleaseTrain(name, version);
24371 ▶     const isPrerelease = version.prerelease[0] === "rc" || version.prerelease[0] === "next";
24372 │     if (isExceptionalMinor) {
24373 │       if (exceptionalMinor !== null) {
24374 │         throw Error(`Unable to determine latest release-train. Found an additional exceptional minor version branch: "${name}". Already discovered: ${exceptionalMinor.branchName}.`);
24375 │       }
24376 │       if (!checks.canHaveExceptionalMinor(releaseCandidate)) {
24377 │         throw Error(`Unable to determine latest release-train. Found an unexpected exceptional minor version branch: "${name}". No exceptional minor is currently allowed.`);
24378 │       }
24379 │       if (!checks.isValidExceptionalMinorVersion(version, releaseCandidate)) {
24380 │         throw Error(`Unable to determine latest release-train. Found an invalid exceptional minor version branch: "${name}". Invalid version: ${version}.`);
24381 │       }
24382 │       exceptionalMinor = releaseTrain;
24383 │       continue;
24384 │     }
24385 ▶     if (isPrerelease) {
24386 │       if (exceptionalMinor !== null) {
24387 │         throw Error(`Unable to determine latest release-train. Discovered a feature-freeze/release-candidate version branch (${name}) that is older than an in-progress exceptional minor (${exceptionalMinor.branchName}).`);
24388 │       }
24389 │       if (releaseCandidate !== null) {
24390 │         throw Error(`Unable to determine latest release-train. Found two consecutive pre-release version branches. No exceptional minors are allowed currently, and there cannot be multiple feature-freeze/release-candidate branches: "${name}".`);
24391 │       }
24392 │       if (!checks.isValidReleaseCandidateVersion(version)) {
24393 │         throw Error(`Discovered unexpected old feature-freeze/release-candidate branch. Expected no version-branch in feature-freeze/release-candidate mode for v${version.major}.`);
24394 │       }
24395 ▶       releaseCandidate = releaseTrain;
24396 │       continue;
24397 │     }
24398 ▶     latest = releaseTrain;
24399 ▶     break;
24400 │   }
24401 │   return { releaseCandidate, exceptionalMinor, latest };
```

ブランチは新しい順に並んでいます。24369 行目でそのブランチの package.json を読み、24371 行目で版が `-rc` か `-next` なら `isPrerelease`。プレリリースのブランチは 24395 行目で `releaseCandidate`（RC の列車）になり、最初に見つかった正式版のブランチが 24398 行目で `latest` になって、24399 行目で探すのをやめます。2026-09-16 の状態なら、22.2.x（`22.2.0-rc.0`）が RC、22.1.x（`22.1.7`）が latest です。つまり「どのブランチがいまのパッチのブランチか」は誰かが設定に書いているのではなく、**各ブランチの package.json の version** から毎回計算されます。

## 4. target: ラベルと入るブランチ

📄 `angular/contributing-docs/branches-and-versioning.md` L79–104 （▶ の行: 85–89, 91–93, 103–104）

```md
 79 │ ### Labelling pull requests
 80 │ 
 81 │ There are five labels that target PRs to versions:
 82 │ 
 83 │ | Label         | Description                                                                 |
 84 │ | ------------- | --------------------------------------------------------------------------- |
 85 ▶ | target: major | A change that includes a backwards-incompatible behavior or API change.     |
 86 ▶ | target: minor | A change that introduces a new, backwards-compatible functionality.         |
 87 ▶ | target: patch | A backwards-compatible bug fix.                                             |
 88 ▶ | target: rc    | A change that should be explicitly included in an active release candidate. |
 89 ▶ | target: lts   | A critical security or browser compatibility fix for LTS releases.          |
 90 │ 
 91 ▶ Every PR must have exactly one `target: *` label. Angular's dev tooling will merge the pull request
 92 ▶ into its base branch and then cherry-pick the commits to the appropriate branches based on the
 93 ▶ specified target label.
 94 │ 
 95 │ The vast majority of pull requests will target `major`, `minor`, or `patch` based on the contents of
 96 │ the code change. In rare cases, a pull request will specify `target: rc` or `target: lts` to
 97 │ explicitly target a special branch.
 98 │ 
 99 │ Note that PRs merged with `target: rc` often benefit from additional testing in an RC release.
100 │ Therefore PR authors and caretakers should consider publishing a new `-next` release after merging
101 │ any PRs to an RC branch to support extra testing before the stable release.
102 │ 
103 ▶ Breaking changes, marked with `target: major`, can only be merged when `main` represents the next
104 ▶ major version.
```

85〜89 行目の 5 つが版に結び付くラベルです。91〜93 行目、PR には **ちょうど 1 つ** の `target:` が要り、道具は PR をまず base のブランチにマージし、そのあとラベルに応じたブランチへ cherry-pick します。103〜104 行目、`target: major` は main が次の major を表しているときしか入りません。

📄 `angular/node_modules/@angular/ng-dev/bundles/cli.mjs` L35695–35729 （▶ の行: 35699–35700, 35702, 35711, 35717–35718, 35720–35722）

```js
35695 │   const labelConfigs = [
35696 │     {
35697 │       label: targetLabels["TARGET_MAJOR"],
35698 │       branches: () => {
35699 ▶         if (!next.isMajor) {
35700 ▶           throw new InvalidTargetLabelError(`Unable to merge pull request. The "${nextBranchName}" branch will be released as a minor version.`);
35701 │         }
35702 ▶         return [nextBranchName];
35703 │       }
35704 │     },
35705 │     {
35706 │       label: targetLabels["TARGET_MINOR"],
35707 │       branches: (githubTargetBranch) => {
35708 │         if (githubTargetBranch === exceptionalMinor?.branchName) {
35709 │           return [exceptionalMinor.branchName];
35710 │         }
35711 ▶         return [nextBranchName];
35712 │       }
35713 │     },
35714 │     {
35715 │       label: targetLabels["TARGET_PATCH"],
35716 │       branches: (githubTargetBranch) => {
35717 ▶         if (githubTargetBranch === latest.branchName) {
35718 ▶           return [latest.branchName];
35719 │         }
35720 ▶         const branches = [nextBranchName, latest.branchName];
35721 ▶         if (releaseCandidate !== null) {
35722 ▶           branches.push(releaseCandidate.branchName);
35723 │         }
35724 │         if (exceptionalMinor !== null) {
35725 │           branches.push(exceptionalMinor.branchName);
35726 │         }
35727 │         return branches;
35728 │       }
35729 │     },
```

1. **35699〜35702 行目：major**

   main の列車が major でなければエラー。22.2.0-next.7 の main は minor として出るので、いまは誰も `target: major` で入れられません。
2. **35711 行目：minor**

   main だけ。新機能はパッチのブランチには入りません。
3. **35717〜35718 行目：patch で base がパッチのブランチ**

   そのブランチだけ（main には入らない）。「latest の版だけ直したい」ときの書き方です。
4. **35720〜35722 行目：patch で base が main**

   main と latest、RC のブランチがあればそれも。ふつうのバグ修正はこれです。

📄 `angular/node_modules/@angular/ng-dev/bundles/cli.mjs` L35730–35750 （▶ の行: 35733–35734, 35736–35737, 35739, 35745–35746）

```js
35730 │     {
35731 │       label: targetLabels["TARGET_RC"],
35732 │       branches: (githubTargetBranch) => {
35733 ▶         if (releaseCandidate === null) {
35734 ▶           throw new InvalidTargetLabelError(`No active feature-freeze/release-candidate branch. Unable to merge pull request using "target: rc" label.`);
35735 │         }
35736 ▶         if (githubTargetBranch === releaseCandidate.branchName) {
35737 ▶           return [releaseCandidate.branchName];
35738 │         }
35739 ▶         return [nextBranchName, releaseCandidate.branchName];
35740 │       }
35741 │     },
35742 │     {
35743 │       label: targetLabels["TARGET_FEATURE"],
35744 │       branches: (githubTargetBranch) => {
35745 ▶         if (isVersionBranch(githubTargetBranch) || githubTargetBranch === nextBranchName) {
35746 ▶           throw new InvalidTargetBranchError('"target: feature" pull requests cannot target a releasable branch');
35747 │         }
35748 │         return [githubTargetBranch];
35749 │       }
35750 │     },
```

`target: rc` は、35733〜35735 行目のとおり RC のブランチが無い時期には使えません。base が RC のブランチならそこだけ（35736〜35737 行目）、base が main なら main と RC の 2 本（35739 行目）。35745〜35746 行目、`target: feature` は main や版のブランチには向けられません（機能ごとの作業用のブランチ用）。

📄 `angular/node_modules/@angular/ng-dev/bundles/cli.mjs` L35761–35779 （▶ の行: 35766–35767, 35769, 35772, 35776–35777）

```js
35761 │   try {
35762 │     assertValidReleaseConfig(config2);
35763 │     labelConfigs.push({
35764 │       label: targetLabels["TARGET_LTS"],
35765 │       branches: async (githubTargetBranch) => {
35766 ▶         if (!isVersionBranch(githubTargetBranch)) {
35767 ▶           throw new InvalidTargetBranchError(`PR cannot be merged as it does not target a long-term support branch: "${githubTargetBranch}"`);
35768 │         }
35769 ▶         if (githubTargetBranch === latest.branchName) {
35770 │           throw new InvalidTargetBranchError(`PR cannot be merged with "target: lts" into patch branch. Consider changing the label to "target: patch" if this is intentional.`);
35771 │         }
35772 ▶         if (releaseCandidate !== null && githubTargetBranch === releaseCandidate.branchName) {
35773 │           throw new InvalidTargetBranchError(`PR cannot be merged with "target: lts" into feature-freeze/release-candidate branch. Consider changing the label to "target: rc" if this is intentional.`);
35774 │         }
35775 │         assertValidReleaseConfig(config2);
35776 ▶         await assertActiveLtsBranch(repo, config2.release, githubTargetBranch);
35777 ▶         return [githubTargetBranch];
35778 │       }
35779 │     });
```

`target: lts` は、base が版のブランチであること（35766〜35767）、それがいまのパッチのブランチでも RC のブランチでもないこと（35769・35772）、そして 35776 行目で LTS の期間内であることを確かめ、35777 行目で **base のブランチだけ**を返します。

📄 `angular/contributing-docs/triage-and-labelling.md` L139–166 （▶ の行: 143, 149, 151, 156–160, 162–163, 165）

```md
139 │ Targeting an active release train:
140 │ 
141 │ - `target: major`: Any breaking change
142 │ - `target: minor`: Any new feature
143 ▶ - `target: patch`: Bug fixes, refactorings, documentation changes, etc. that pose no or very low
144 │   risk of adversely
145 │   affecting existing applications.
146 │ 
147 │ Special Cases:
148 │ 
149 ▶ - `target: rc`: A critical fix for an active release-train while it is in a feature freeze or RC
150 │   phase
151 ▶ - `target: lts`: A critical fix for a specific release-train that is still within the long term
152 │   support phase
153 │ 
154 │ Notes:
155 │ 
156 ▶ - To land a change only in a patch/RC branch, without landing it in any other active release-train
157 ▶   branch (such
158 ▶   as `main`), the patch/RC branch can be targeted in the GitHub UI with the appropriate
159 ▶   `target: patch`/`target: rc` label.
160 ▶ - `target: lts` PRs must target the specific LTS branch they would need to merge into in the GitHub
161 │   UI, in
162 ▶   cases which a change is desired in multiple LTS branches, individual PRs for each LTS branch must
163 ▶   be created
164 │ 
165 ▶ If a PR is missing the `target:*` label, it will be marked as pending by the angular robot status
166 │ checks.
```

仕分けの手引きの方も、コードと同じことを言っています。156〜159 行目、パッチのブランチにだけ入れたいときは GitHub の画面でそのブランチを base にして `target: patch`（35717〜35718 行目）。160〜163 行目、`target: lts` は LTS のブランチを base にし、複数の LTS に入れたいときはブランチごとに別の PR（35777 行目が base だけを返すから）。165 行目、`target:` が無い PR は angular-robot の状態が pending のままです（[第 10 回](10-contrib-pr-flow.md)の angular-robot.yml の `requiredLabels`）。143 行目には、`target: patch` が「バグ修正」だけでなく**リファクタリングやドキュメントの変更**にも使われると書かれています。

📄 `angular/contributing-docs/branches-and-versioning.md` L117–127 （▶ の行: 121–124, 126–127）

```md
117 │ ### Pull request examples
118 │ 
119 │ | I want to...                                                | Target branch           | Target label | Your change will land in...                                                                                                |
120 │ | ----------------------------------------------------------- | ----------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------- |
121 ▶ | Make a non-breaking bug fix                                 | `main`                  | `patch`      | `main`, the active patch branch, and the active RC branch if there is one                                                  |
122 ▶ | Introduce a new feature                                     | `main`                  | `minor`      | `main` (any time)                                                                                                          |
123 ▶ | Make a breaking change                                      | `main`                  | `major`      | `main` (only when `main` represents the next major version)                                                                |
124 ▶ | Make a critical security fix                                | `main`                  | `lts`        | `main`, the active patch branch, the active RC branch if there is one, and all branches for versions within the LTS window |
125 │ | Bump the version of an RC                                   | the active RC branch    | `rc`         | The active RC branch                                                                                                       |
126 ▶ | Fix an RC bug for a major release feature                   | `main`                  | `rc`         | `main` and the active RC branch                                                                                            |
127 ▶ | Backport a bug fix to the `latest` npm version during an RC | the active patch branch | `patch`      | the active patch branch only                                                                                               |
```

> [!WARNING]
> **ハマりどころ**
>
> 124 行目の `lts` の行は「main、パッチのブランチ、RC のブランチ、LTS の全ブランチに入る」と書いていますが、ng-dev のコード（35766〜35777 行目）と仕分けの手引き（160〜163 行目）は「LTS のブランチを base にし、そのブランチだけ」です。マージを実際に決めるのはコードの方です。ここは手引きの食い違いで、[第 15 回](15-contrib-first-pr.md)と同じ種類の「直せる docs の誤り」の候補です （直す前に、最新の main と既存の issue・PR を確かめるのは第 15 回の手順と同じ）。

📄 `angular/contributing-docs/branches-and-versioning.md` L106–115 （▶ の行: 110–111, 114–115）

```md
106 │ Two additional target labels do not map to specific versions while still defining which branch to merge into.
107 │ 
108 │ | Label              | Description                                            |
109 │ | ------------------ | ------------------------------------------------------ |
110 ▶ | target: automation | An automated change made by the angular-robot account. |
111 ▶ | target: feature    | A change to be made in a feature branch.               |
112 │ 
113 │ Changes made to a feature branch, outside of our typical branching and merging process utilize the
114 ▶ `target: feature` branch. Additionally, the `target: automation` label, which is only able to be
115 ▶ utilized by the `angular-robot` account targets only the branch defined within the GitHub UI.
```

残りの 2 つは版に結び付きません。110 行目の `target: automation` は 115 行目のとおり angular-robot のアカウント専用（依存の更新など）、111 行目の `target: feature` は機能ごとの作業用のブランチ用です。あなたの PR で使うのは major・minor・patch・rc・lts のどれかです。

## 5. コミットの種類とラベルの組み合わせ

📄 `angular/node_modules/@angular/ng-dev/bundles/cli.mjs` L36655–36689 （▶ の行: 36664–36668, 36672–36673, 36680, 36683, 36686）

```js
36655 │ // ng-dev/pr/common/validation/assert-allowed-target-label.js
36656 │ var automationBots = ["angular-robot"];
36657 │ var changesAllowForTargetLabelValidation = createPullRequestValidation({ name: "assertChangesAllowForTargetLabel", canBeForceIgnored: true }, () => Validation);
36658 │ var Validation = class extends PullRequestValidation {
36659 │   assert(commits, targetLabel, config2, releaseTrains, labelsOnPullRequest, pullRequest) {
36660 │     if (labelsOnPullRequest.includes(mergeLabels["MERGE_FIX_COMMIT_MESSAGE"].name)) {
36661 │       Log.debug("Skipping commit message target label validation because the commit message fixup label is applied.");
36662 │       return;
36663 │     }
36664 ▶     const exemptedScopes = config2.targetLabelExemptScopes || [];
36665 ▶     commits = commits.filter((commit) => !exemptedScopes.includes(commit.scope));
36666 ▶     const hasBreakingChanges = commits.some((commit) => commit.breakingChanges.length !== 0);
36667 ▶     const hasDeprecations = commits.some((commit) => commit.deprecations.length !== 0);
36668 ▶     const hasFeatureCommits = commits.some((commit) => commit.type === "feat");
36669 │     switch (targetLabel) {
36670 │       case targetLabels["TARGET_MAJOR"]:
36671 │         break;
36672 ▶       case targetLabels["TARGET_MINOR"]:
36673 ▶         if (hasBreakingChanges) {
36674 │           throw this._createHasBreakingChangesError(targetLabel);
36675 │         }
36676 │         break;
36677 │       case targetLabels["TARGET_RC"]:
36678 │       case targetLabels["TARGET_LTS"]:
36679 │       case targetLabels["TARGET_PATCH"]:
36680 ▶         if (hasBreakingChanges) {
36681 │           throw this._createHasBreakingChangesError(targetLabel);
36682 │         }
36683 ▶         if (hasFeatureCommits) {
36684 │           throw this._createHasFeatureCommitsError(targetLabel);
36685 │         }
36686 ▶         if (hasDeprecations && !releaseTrains.isFeatureFreeze()) {
36687 │           throw this._createHasDeprecationsError(targetLabel);
36688 │         }
36689 │         break;
```

マージの前に、PR に含まれるコミットとラベルの組み合わせを ng-dev が確かめます。36664〜36665 行目、pull-request.mjs の `targetLabelExemptScopes`（`docs-infra`）の scope のコミットは数えません。36666〜36668 行目でコミットメッセージから「破壊的変更を含むか」「非推奨を含むか」「`feat` があるか」を調べます（footer の `BREAKING CHANGE:` と `DEPRECATED:`、[第 9 回](09-contrib-commit-messages.md)）。

| ラベル | fix / docs / refactor / perf | feat | BREAKING CHANGE | DEPRECATED | 根拠 |
| --- | --- | --- | --- | --- | --- |
| `target: major` | ○ | ○ | ○ | ○ | 36670〜36671 行目（検査なし） |
| `target: minor` | ○ | ○ | × | ○ | 36672〜36675 行目 |
| `target: patch` / `rc` / `lts` | ○ | × | × | feature freeze 中だけ ○ | 36677〜36688 行目 |

36686 行目の「feature freeze 中だけ」の判定は `releaseTrains.isFeatureFreeze()` で、RC のブランチがあり、その版がまだ `-next`（`-rc` になる前）のときに true です。それ以外の時期に非推奨の告知を入れるなら `target: minor` です。

## 6. CHANGELOG に出る

CHANGELOG.md の構造（1 版ごとの見出しと scope ごとの表、表の 1 行が 1 コミット）は[第 9 回](09-contrib-commit-messages.md)で先頭の `22.2.0-next.6` の節を引いて読みました。その節の compiler の `fix`（`9b80d4ce9e` namespace `@property` declarations）と core の `fix`（`70756b506c` apply SkipSelf …）を覚えておいて、すぐ下の同じ日のパッチ版を見ます。

📄 `angular/CHANGELOG.md` L40–61 （▶ の行: 40–41, 45, 53）

```md
40 ▶ <a name="22.1.6"></a>
41 ▶ # 22.1.6 (2026-09-09)
42 │ ### compiler
43 │ | Commit | Type | Description |
44 │ | -- | -- | -- |
45 ▶ | [cbb8702143](https://github.com/angular/angular/commit/cbb8702143bd04b68253758dbc2c4a8fb49c0237) | fix | namespace `@property` declarations |
46 │ ### compiler-cli
47 │ | Commit | Type | Description |
48 │ | -- | -- | -- |
49 │ | [aea121e532](https://github.com/angular/angular/commit/aea121e53217a7f74d2a8e4a7a6bf0f3a96b7c49) | fix | do not flag callable objects with zero parameters in uninvoked track function check |
50 │ ### core
51 │ | Commit | Type | Description |
52 │ | -- | -- | -- |
53 ▶ | [c19b948ef8](https://github.com/angular/angular/commit/c19b948ef8d34e5a15e41cd5a88cdd4bda848f8f) | fix | apply SkipSelf to only the starting node in embedded views |
54 │ ### platform-server
55 │ | Commit | Type | Description |
56 │ | -- | -- | -- |
57 │ | [d20a379583](https://github.com/angular/angular/commit/d20a37958318c898a72109480cee556e388cd78b) | fix | avoid sourcemap corruption during domino path substitution |
58 │ ### router
59 │ | Commit | Type | Description |
60 │ | -- | -- | -- |
61 │ | [95c01e9cde](https://github.com/angular/angular/commit/95c01e9cdea251e09d321a01e9b982b2fe1b7873) | fix | keep detached route subtree contexts isolated and intact |
```

22.1.x から出た `22.1.6` の節です。45 行目の `namespace @property declarations` は next.6 と同じ修正ですが、コミットの SHA が違います（`9b80d4ce9e` と `cbb8702143`）。53 行目の `apply SkipSelf …` も同じで、SHA は `70756b506c` と `c19b948ef8`。これが `target: patch` で main に入り、22.1.x に cherry-pick された結果です。一方で next.6 にあった `feat`（ErrorBoundary の API など）は、5 節のとおり patch にできないので、この節にはありません。

📄 `git log（22.1.x 側のコミット）`

```
$ git log -1 --format='%h %s' cbb8702143
cbb8702143b fix(compiler): namespace `@property` declarations
$ git log -1 --format=%b cbb8702143 | grep 'cherry picked'
(cherry picked from commit 9b80d4ce9e00d50d471c1a1a98ab67ec53fbce5f)
```

パッチのブランチ側のコミットの最後には、[第 10 回](10-contrib-pr-flow.md)の `linkToOriginalCommits: true` が付けた行が残っています。

📄 `angular/CHANGELOG.md` L65–79 （▶ の行: 66, 70, 75, 79）

```md
65 │ <a name="20.3.31"></a>
66 ▶ # 20.3.31 (2026-09-09)
67 │ ### platform-server
68 │ | Commit | Type | Description |
69 │ | -- | -- | -- |
70 ▶ | [3db26e2544](https://github.com/angular/angular/commit/3db26e2544964d07a520836ad01f02f36ec88e25) | fix | update domino to latest version |
71 │ 
72 │ <!-- CHANGELOG SPLIT MARKER -->
73 │ 
74 │ <a name="21.2.23"></a>
75 ▶ # 21.2.23 (2026-09-09)
76 │ ### platform-server
77 │ | Commit | Type | Description |
78 │ | -- | -- | -- |
79 ▶ | [fc2e8fbc0b](https://github.com/angular/angular/commit/fc2e8fbc0bda2f5c11585e8a0cbd88c074f5e567) | fix | update domino to latest version |
```

同じ日に LTS の 2 本からも版が出ています。66 行目の `20.3.31` と 75 行目の `21.2.23` に、同じ文言の修正（70・79 行目 `update domino to latest version`）が別の SHA で載っています。どちらのコミットにも `(cherry picked from …)` の行は無く、`git branch -r --contains` で見るとそれぞれ自分のブランチ（`origin/20.3.x`・`origin/21.2.x`）にしかありません。4 節の `target: lts` が base のブランチだけを返す（35777 行目）ので、LTS には 1 本ずつ入れる、という形がそのまま CHANGELOG に出ています。

📄 `angular/.ng-dev/release.mjs` L6–34 （▶ の行: 7–8, 12–13, 15, 29–30）

```js
 6 │ export const release = {
 7 ▶   publishRegistry: 'https://wombat-dressing-room.appspot.com',
 8 ▶   representativeNpmPackage: '@angular/core',
 9 │   npmPackages: [
10 │     {
11 │       name: '@angular/animations',
12 ▶       deprecated: {
13 ▶         version: '>=20.2.0-next.3',
14 │         message:
15 ▶           '@angular/animations is deprecated. Use `animate.enter` and `animate.leave` instead. For more information see: https://v22.angular.dev/guide/animations.',
16 │       },
17 │     },
18 │     {name: '@angular/common'},
19 │     {name: '@angular/compiler-cli'},
20 │     {name: '@angular/compiler'},
21 │     {name: '@angular/core'},
22 │     {name: '@angular/elements'},
23 │     {name: '@angular/forms'},
24 │     {name: '@angular/language-server'},
25 │     {name: '@angular/language-service'},
26 │     {name: '@angular/localize'},
27 │     {
28 │       name: '@angular/platform-browser-dynamic',
29 ▶       deprecated: {
30 ▶         version: '>=20.1.0-next.0',
31 │         message:
32 │           '@angular/platform-browser-dynamic is deprecated. Use `@angular/platform-browser` instead.',
33 │       },
34 │     },
```

リリースを作る `ng-dev release` の設定です。8 行目、ブランチの版を npm の公開済みの版と照らすときは `@angular/core` を代表に使います。12〜15 行目と 29〜32 行目には、パッケージ全体の非推奨の例があります。`@angular/animations` は `20.2.0-next.3` 以降の版を npm で「deprecated」として公開し、15 行目の文面がインストールのときに表示されます。これは API 1 つの非推奨ではなく、パッケージを丸ごと非推奨にする仕組みです。

## 7. サポートの期間と非推奨の方針

📄 `angular/adev/src/content/reference/releases.md` L75–112 （▶ の行: 81, 88, 92–93, 101–103, 111–112）

```md
 75 │ ### Release schedule
 76 │ 
 77 │ | Version | Date               |
 78 │ | :------ | :----------------- |
 79 │ | v22.1   | Week of 2026-07-27 |
 80 │ | v22.2   | ~ September 2026   |
 81 ▶ | v22.3   | ~ November 2026    |
 82 │ | v22.4   | ~ January 2027     |
 83 │ | v22.5   | ~ March 2027       |
 84 │ | v23.0   | ~ June 2027        |
 85 │ 
 86 │ ### Support window
 87 │ 
 88 ▶ All major releases are typically supported for 24 months.
 89 │ 
 90 │ | Support stage     | Support Timing | Details                                                             |
 91 │ | :---------------- | :------------- | :------------------------------------------------------------------ |
 92 ▶ | Active            | 12 months      | Regularly-scheduled updates and patches are released                |
 93 ▶ | Long-term \(LTS\) | 12 months      | Only [critical fixes and security patches](#lts-fixes) are released |
 94 │ 
 95 │ ### Actively supported versions
 96 │ 
 97 │ The following table provides the status for Angular versions under support.
 98 │ 
 99 │ | Version | Status | Released   | Active ends | LTS ends   |
100 │ | :------ | :----- | :--------- | :---------- | :--------- |
101 ▶ | ^22.0.0 | Active | 2026-06-03 | 2027-06     | 2028-06    |
102 ▶ | ^21.0.0 | LTS    | 2025-11-19 | 2026-06-03  | 2027-06    |
103 ▶ | ^20.0.0 | LTS    | 2025-05-28 | 2025-11-19  | 2026-11-28 |
104 │ 
105 │ IMPORTANT: Angular versions v2 to v19 are no longer supported.
106 │ 
107 │ ### LTS fixes
108 │ 
109 │ As a general rule, a fix is considered for an LTS version if it resolves one of:
110 │ 
111 ▶ - A newly identified security vulnerability,
112 ▶ - A regression, since the start of LTS, caused by a 3rd party change, such as a new browser version.
```

88 行目、major は 24 か月サポートされます。92〜93 行目、最初の 12 か月が Active（ふつうのパッチ）、残りの 12 か月が LTS（重大な修正とセキュリティの修正だけ）。101〜103 行目、いま Active なのは v22、LTS は v21 と v20。git のタグに `v21.2.25` や `v20.3.34` があるのは、21.2.x と 20.3.x が LTS のブランチとして生きているからです。111〜112 行目、LTS に入れてもらえる修正は「新しく見つかった脆弱性」と「LTS に入ってから外部（ブラウザなど）のせいで起きた退行」だけです。81 行目の予定のとおり、次の minor の 22.3 は 2026 年 11 月ごろです。

📄 `angular/adev/src/content/reference/releases.md` L114–124 （▶ の行: 116, 122–123）

```md
114 │ ## Deprecation policy
115 │ 
116 ▶ When the Angular team intends to remove an API or feature, it will be marked as _deprecated_. This occurs when an API is obsolete, superseded by another API, or otherwise discontinued. Deprecated API remain available through their deprecated phase, which lasts a minimum one major version (approximately one year).
117 │ 
118 │ To help ensure that you have sufficient time and a clear path to update, this is our deprecation policy:
119 │ 
120 │ | Deprecation stages | Details                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
121 │ | :----------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
122 ▶ | Announcement       | We announce deprecated APIs and features in the [change log](https://github.com/angular/angular/blob/main/CHANGELOG.md 'Angular change log'). Deprecated APIs appear in the [documentation](api?status=8) with ~~strikethrough~~. When we announce a deprecation, we also announce a recommended update path. Additionally, all deprecated APIs are annotated with `@deprecated` in the corresponding documentation, which enables text editors and IDEs to provide hints if your project depends on them. |
123 ▶ | Deprecation period | When an API or a feature is deprecated, it is still present in at least the next major release (period of at least 12 months). After that, deprecated APIs and features are candidates for removal. A deprecation can be announced in any release, but the removal of a deprecated API or feature happens only in major release. Until a deprecated API or feature is removed, it is maintained according to the LTS support policy, meaning that only critical and security issues are fixed.             |
124 │ | npm dependencies   | We only make npm dependency updates that require changes to your applications in a major release. In minor releases, we update peer dependencies by expanding the supported versions, but we do not require projects to update these dependencies until a future major version. This means that during minor Angular releases, npm dependency updates within Angular applications and libraries are optional.                                                                                              |
```

116 行目、非推奨にした API は少なくとも major 1 つ分（約 1 年）残ります。122 行目、告知は CHANGELOG と API のドキュメント（打ち消し線と `@deprecated`）で行い、代わりの方法も一緒に示します。123 行目、非推奨の告知はどの版でもできますが、**削除は major でだけ**行います。だから「非推奨にする PR」は minor（DEPRECATED の footer 付きの `feat` や `refactor`）で入れ、「削除する PR」は BREAKING CHANGE の footer 付きで `target: major` にして、main が次の major を表す時期（2 節の 38〜39 行目）を待ちます。API の注記の書き方は[第 8 回](08-contrib-public-api.md)です。

## 8. DEMO：ラベルを選ぶと、どこに入りどの版で出るか

> **🧪 DEMO — target: ラベル → ブランチと版（再現）**
>
> ng-dev の 2 つの関数（5 節の種類の検査 cli.mjs L36659-36689、4 節のブランチの決定 cli.mjs L35695-35779）を小さく再現した表です。各時点のブランチと版は、git のタグと origin の各ブランチの package.json から読みました。「次に出る版」は番号を 1 つ上げただけの目安です（実際には列車が進んで別の版になることがあります）。
>
> ▶ [このデモはサイトで動かせます](https://angular-deep-dive-cyan.vercel.app/chapter/contrib-branches)

## 全体の trace

- 👤 `target: patch` を付けた PR（base: main） — triage-and-labelling.md L143 — *バグ修正・docs・refactor*
- `pnpm ng-dev pr merge <番号>` — caretaker — *第 10 回の 6 節*
  - `fetchActiveReleaseTrains()` — ng-dev/bundles/chunk-U7PAJR6D.mjs L24325 — *main と版のブランチの package.json を読む*
    - `findActiveReleaseTrainsFromVersionBranches()` — chunk-U7PAJR6D.mjs L24369-24401 — *RC と latest を決める*
  - `getTargetLabelConfigsForActiveReleaseTrains()` — ng-dev/bundles/cli.mjs L35695 — *patch → \[main, latest, rc?\]*
  - `assertChangesAllowForTargetLabel` — ng-dev/bundles/cli.mjs L36659 — *feat・破壊的変更を弾く*
  - `GithubApiMergeStrategy.merge()` — ng-dev/bundles/cli.mjs — *main に入れて 22.1.x へ cherry-pick*
- `ng-dev release` — .ng-dev/release.mjs — *22.2.0-next.N と 22.1.N を出し、CHANGELOG に載る*

## 聞かれそうな質問

**Q. バグ修正は全部 target: patch？**

ほとんどはそうです。branches-and-versioning.md の 121 行目のとおり「破壊的でないバグ修正」は base を main にして `target: patch` で、main・いまのパッチのブランチ・（あれば）RC のブランチに入ります（cli.mjs 35720〜35722 行目）。例外は 2 つ。直し方が振る舞いを変えてしまう修正は破壊的変更なので `target: major`（36680〜36682 行目が patch を止める）。もう 1 つは、修正のために新しい API を足すとき（コミットが `feat`）で、これは patch にできず `target: minor` です（36683〜36685 行目）。逆に triage-and-labelling.md の 143 行目のとおり、ドキュメントやリファクタリングも危険が小さければ `target: patch` です。

**Q. 破壊的変更はいつ入る？**

main が次の major を表している期間だけです（branches-and-versioning.md の 103〜104 行目、cli.mjs の 35699〜35701 行目）。2 節の 38〜40 行目のとおり、その年の最後の minor（v22 なら 22.5.0）を出したあとの約 3 か月で、main の版が `23.0.0-next.N` になっている間です。それ以外の時期に開いた破壊的変更の PR は、承認されても `target: major` のまま待つことになります。

**Q. 非推奨にしてから消すまでは？**

releases.md の 116 行目と 123 行目のとおり、少なくとも次の major まで（12 か月以上）残し、消すのは major でだけです。手順としては、まず `@deprecated` の注記と DEPRECATED の footer を付けた PR を minor で入れ（feature freeze 中なら patch でも可、cli.mjs の 36686 行目）、1 つ以上 major を挟んでから、BREAKING CHANGE の footer を付けた削除の PR を `target: major` で入れます。

**Q. どのブランチがいまのパッチのブランチかは、どこに書いてある？**

どこにも固定では書かれていません。ng-dev が毎回、main と版のブランチの package.json の version を読んで決めます（chunk-U7PAJR6D.mjs の 24327・24369 行目）。正式版の最も新しいブランチが latest（24398 行目）、プレリリースの版のブランチがあればそれが RC（24395 行目）です。

## 読み終えて

- ブランチは main（プレリリース）と `22.2.x` のような版のブランチ。どれが latest・RC かは package.json の version から ng-dev が計算する。
- ふつうのバグ修正は base を main にして `target: patch`。main・latest・（あれば）RC に入る。
- `feat` は patch にできず、破壊的変更は major でだけ。これを止めるのは ng-dev の検査（cli.mjs 36669〜36689 行目）。
- CHANGELOG には main の版とパッチの版の両方に同じ修正が載り、パッチ側のコミットには cherry-pick の行が残る。
- branches-and-versioning.md の 124 行目（lts）はコードと食い違っている。直す価値のある docs の誤りは、読んでいると見つかる。

---

← 前: [PR が通るまで：CI・ラベル・レビュー・マージ](10-contrib-pr-flow.md)  
次: [issue の仕分け：ラベル・優先度・最初に手を付ける issue](12-contrib-triage.md) →
