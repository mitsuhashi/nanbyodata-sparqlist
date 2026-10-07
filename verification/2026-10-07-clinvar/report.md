# ClinVar SPARQList 検証結果

検証日時: 2026-10-07 17:45 JST

対象: `nanbyodata_get_clinvar_variant_by_nando_id.md`

SHA-256: `f44aaefbcfb064a27c92a683afe3e205b94fb6db1922f50556f96ca9f67e1887`

## 判定

現在のクエリは、TogoVarのvariantグラフ全体を外側のOPTIONALで囲み、TogoVarにエントリがない場合もClinVar情報を返す。今回の5ケースは再試行を含めすべて成功した。1200061は初回にTogoVar側でHTTP 500（Transaction timed out）となり、そのケースのみ再試行して成功した。失敗の記録もevidence.json内のprior_attemptに保存している。対象SPARQListの内容は変更していない。

TogoVarエントリがあればIDと型が存在するという仕様に基づき、内側のOPTIONALは不要として評価した。tgv形式と座標形式は両方ともTogoVarエントリありに数える。

## 実データの結果

件数はClinVar IDで重複を除いた値。同じClinVar IDについて、どちらかの形式のTogoVar IDが1つでもあれば「TogoVarあり」、どちらもなければ「ClinVarのみ」と分類する。分類は照会したRDFでの対応関係に基づく。

| NANDO ID | ユニークClinVar ID | TogoVarあり（両形式） | ClinVarのみ |
| --- | ---: | ---: | ---: |
| 1200030 | 10 | 8 | 2 |
| 1200061 | 997 | 619 | 378 |
| 1200183 | 15 | 7 | 8 |
| 9999999（対応なし） | 0 | 0 | 0 |
| 空文字 | 0 | 0 | 0 |

APIの出力行数は、識別子や疾患・解釈等の組み合わせにより上表と異なる。

| NANDO ID | 出力行数 | TogoVar IDありの行数 | TogoVar ID空欄の行数 |
| --- | ---: | ---: | ---: |
| 1200030 | 14 | 12 | 2 |
| 1200061 | 1,309 | 912 | 397 |
| 1200183 | 22 | 14 | 8 |
| 9999999 | 0 | 0 | 0 |
| 空文字 | 0 | 0 | 0 |

## 確認内容

- 専用ローカルテスト9件すべて成功。ブロック抽出、MedGen変換、空結果、12フィールドの出力、欠損処理、座標形式IDのリンク、ClinVarのみのレコード保持、テンプレート展開を確認。
- 最新の生データを検査し、全行が12個の文字列フィールドを持ち、ClinVar ID・リンク・タイトルを保持していることを確認。
- TogoVar IDありの全行で、型・座標が存在し、IDに対応するTogoVarリンクが生成されることを確認。
- TogoVar IDなしの全行で、TogoVarリンク・型・座標も空文字となり、ClinVar情報は保持されることを確認。
- `1200183` で `tgv40123502` を確認。同じ疾患の `VCV000301503` はClinVarのみの行として保持されることを確認。
- 入力の空文字と対応なしIDはエラーにならず、空配列を返した。Markdownのdefault欄は空であり、この空文字検証はテンプレートへ明示的に空文字を渡した結果。

## 残る注意点と検証範囲

- `1200061` の最終JSONには完全に同じ行が7行分あり、JSONとして一意にすると1,302行。今回の7組はSPARQLレスポンスの時点ですでに完全一致しており、JavaScriptで出力項目を省いたことが原因ではない。詳細は下記の重複調査を参照。
- germline classification・評価日など、ClinVar側の必須条件は残っている。条件を満たさないレコードも含めたClinVar全体の網羅性は検証していない。
- `rdf:` PREFIXは未宣言だが、記載のTogoVarエンドポイントではそのまま実行できた。
- Markdownから4ブロックを抽出し、記載されたエンドポイントにSPARQLを直接送信した。JavaScriptはNode.jsのVMで実行した。SPARQListサーバーでのMarkdown解析・デプロイ・HTTPレスポンス、生成リンク先の画面、REST APIとの突合は検証対象外。

## 重複7行の調査

保存済み生データと最終JSONを行ごとに照合した結果、以下の7種類が各2行あり、SPARQLの全返却変数（値・型を含む）が組内で一致していた。すべてTogoVar IDなしの行。

`VCV000371347`, `VCV000813421`, `VCV000813474`, `VCV000857473`, `VCV001173970`, `VCV001721487`, `VCV000969162`

該当7件に絞り、`?_rcv`・`?last_evaluated`・`?_classified_condition` を追加取得すると、各ClinVar IDに異なるRCVノードが2つあり、評価日も異なることが分かった。例: `VCV000371347` は2016-08-31と2024-03-14。疾患名と解釈は同じなので、通常のSELECT項目では区別されない。これが重複候補の発生源と考えられる。

ただし、元のSELECT DISTINCTなら同じ結果は本来1行になる。該当7件への絞り込みだけを追加した診断クエリでは7行に重複排除された一方、保存済みの全件クエリでは各2行だった。エンドポイントのクエリ実行・最適化に依存する挙動が疑われるが、サーバー内部の根本原因は未確定。単にRCVが複数あるだけでDISTINCT後の重複が正当化されるわけではない。

JavaScriptは入力行をmapしているため、エンドポイントから届いた重複をそのまま返している。対象SPARQListは変更していない。追加の比較2クエリ（ClinVarグラフのみ、外側DISTINCT）はHTTP 406で失敗し、その結果からの判断はしていない。

[診断クエリと生データ](duplicate-diagnosis.json)。[DISTINCTの仕様](https://www.w3.org/TR/sparql11-query/#modDistinct)。

## 証跡と再実行

- [実行日時・対象ハッシュ・各段階の生データと出力](evidence.json)
- [集計・実データ検査結果](summary.json)
- [専用テストログ](tests.tap)

```sh
node --test tests/clinvar-standalone.test.mjs
node scripts/verify-clinvar-live.mjs
```

ライブ検証はネットワーク接続とcurlが必要。3疾患、対応なしID、空文字の計5ケースを実行し、`evidence.json` を上書きする。クエリ失敗時は終了コード1。最新レポートと集計は今回の証跡に基づく。
