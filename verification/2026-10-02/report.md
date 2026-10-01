# レスポンス調整後のローカルテスト

記録日：2026-10-02。**42件成功、失敗0件、スキップ0件**。

対象は未コミットのレスポンス調整後の作業ツリーです。実行日時・Node.jsバージョン・ベースコミット・対象ファイルのSHA-256は[run.json](run.json)、全テスト名と実行結果は[tests.tap](tests.tap)に保存しています。

最終レスポンスを例のキー構成（ClinVar 12キー、MGeND 20キー）に限定し、`ClinVar_id`を削除しました。ClinVarでは`Clinvar_id`を維持し、countなど例にない項目を最終JSONから除外しています。MGeNDのcountは残り、画面のfrequencyリンクはビューアで生成します。

## 内訳

以下の番号は説明用で、TAPログの実行順とは異なります。42件は疾患数や変異数ではなく、テストケース数です。

### 処理ロジック：16件

実装：[variants.test.mjs](../../tests/variants.test.mjs)。複数条件を1つのテスト内で確認するものもあります。

| No. | 確認内容 |
| ---: | --- |
| 1 | 入力の正規化（NANDO接頭辞・空白、MGeND/medgen）と不正入力の拒否 |
| 2 | ClinVarのIDが空・不一致の場合のゲノム完全一致による補完、およびID一致 |
| 3 | MGeNDの逆鎖HGVSでゲノムREF/ALTを使い、別アレル候補を除外 |
| 4 | MGeNDのcountで0を維持し、数値がない場合をNo Dataとする |
| 5 | GRCh37の座標をGRCh38 REST検索へ送らない |
| 6 | 空のSPARQL結果ではRESTを呼ばない |
| 7 | 疾患対応クエリにOPTIONAL・FROMがなく、GRAPHが2つある（文字列検査） |
| 8 | MGeNDのindelは転写産物HGVSの完全一致だけを採用 |
| 9 | MGeNDの同一座標の重複行に対してREST検索を1回だけ実行 |
| 10 | ClinVarの染色体・位置・REF・ALT不一致を座標照合で拒否 |
| 11 | ClinVarのREST候補にIDがなくてもゲノム一致で内部count・MGeND情報を補完 |
| 12 | ClinVarのID一致をゲノム一致より優先 |
| 13 | ClinVarのindel完全一致を採用し、異なる表現・ビルドを拒否 |
| 14 | ClinVarのゲノム一致候補が複数ある場合は補完しない |
| 15 | 両経路の内部データで0・No Dataにもfrequencyリンクを生成 |
| 16 | 内部frequencyリンクはREST側IDを優先、次にSPARQL側ID、両方なければ空文字 |

### 保存データによる内部count確認：8件

実装：[live-counts.test.mjs](../../tests/live-counts.test.mjs)。入力と期待値の原本は[2026-09-23のfixture](../../tests/fixtures/live-counts-2026-09-23.json)を参照します。生データはここへ複製しません。

| No. | NANDO | 経路 | TogoVar ID | ALT/ALT | REF/ALT |
| ---: | --- | --- | --- | ---: | ---: |
| 17 | 1200012 | clinvar | tgv15859684 | No Data | No Data |
| 18 | 1200012 | clinvar | tgv15860454 | 12 | No Data |
| 19 | 1200012 | clinvar | tgv324309720 | 0 | No Data |
| 20 | 1200712 | mgend | tgv417504260 | No Data | No Data |
| 21 | 1200712 | mgend | tgv66819977 | 1210 | 2026 |
| 22 | 1200157 | clinvar | tgv417554894 | No Data | No Data |
| 23 | 1200157 | clinvar | tgv415862128 | 0 | No Data |
| 24 | 1200157 | clinvar | tgv238792237 | 12 | No Data |

### 最終JSONの確認：16件（No.25–40）

上記8例それぞれについて、REST候補あり・候補なしの2条件を確認します。実装は同じ[live-counts.test.mjs](../../tests/live-counts.test.mjs)です。

- JSONに変換後、ClinVar 12キー・MGeND 20キーがレスポンス例と過不足なく一致する。
- `ClinVar_id`が含まれない。
- 残した項目の値が内部処理から変わっていない。
- MGeNDのcountが期待値に一致し、候補なしではNo Dataになる。

### 空結果：2件（No.41–42）

ClinVar・MGeNDそれぞれで、空の結果を最終JSONの `[]` として返すことを確認します。

## 検証範囲と制限

- 外部APIには接続せず、人工データと保存済みfixtureでMarkdown内のJavaScriptを実行します。SPARQLの実行、現在の外部データとの一致、SPARQListサーバー起動・配置は確認していません。
- ClinVarのcount・リンクのテストは残っている内部処理の確認です。それらは現在の最終JSONには含まれません。
- ブラウザでのfrequencyリンクの表示・遷移は、この42件に含みません。
- キー比較はソート後に行うため、42件にはキー順の検証を含みません。会話中の別途確認では両経路とも順序一致でしたが、今回保存したTAPログの保証範囲には含めません。
- `type`などの値がレスポンス例と同じ意味かを網羅的に確認するテストではありません。MGeNDの`type`の差は[外部比較記録](../2026-09-24/report.md)に記載しています。
- 公開サイト・TogoVarとの比較内容は[2026-09-24の記録](../2026-09-24/report.md)に集約しています。今回その比較は再実行していません。

## 再実行

リポジトリのルートで実行します（実際の実行コマンドはrun.jsonにも保存）。

```sh
node --test --test-reporter=tap tests/variants.test.mjs tests/live-counts.test.mjs
```
