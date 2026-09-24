# Variant SPARQList verification

2026-09-23に公開エンドポイントへ読み取りクエリを送り、ローカルのMarkdown内のSPARQL・JavaScriptブロックを順に実行して確認しました。サーバーへの配置は行っていません。

| 入力 | 確認結果 |
| --- | --- |
| `1200216 / clinvar` | 8行。修正前の公開APIの8行と全フィールドが一致 |
| `1200216 / mgend` | 6行。修正前の公開APIの6行と全フィールドが一致 |
| `9999999 / clinvar` | 空配列 |
| `9999999 / mgend` | 空配列 |

MGeNDの6行は `tgv417499192`（GRCh38 `1:78013109 T>A`、DNAJB4）の転写産物別HGVSです。6種類の変異ではありません。TogoVar APIは同座標の `T>C` も返すため、座標だけで結び付けてはいけません。

修正点:

- ClinVarのTogoVar IDが一致しない場合、先頭候補で補完する処理を削除。
- MGeNDの塩基比較をc.HGVSからゲノムURIのREF/ALTへ変更。逆鎖でも比較可能。indelは候補内の転写産物HGVS完全一致でのみ補完。
- GRCh37座標をGRCh38 APIへ送らない。
- 疾患対応を必須にし、先にMONDO/OMIMの対応を取得してMGeND検索を絞る。対応が空なら `FILTER(false)` で終了。
- NANDO IDとtargetを検証・正規化し、検索と最終出力で同じ対象を選択。
- 出力に使っていないClinVar評価日を必須条件から除外。
- genotype countの説明を実装に合わせ、明示された0と欠損を区別。

## 再実行

Node.js 18以降を使用。ライブ検証はcurlと公開APIへの接続も必要です。

```sh
node --test tests/variants.test.mjs
node scripts/verify-variants-live.mjs 1200216 clinvar /tmp/clinvar.json
node scripts/verify-variants-live.mjs 1200216 mgend /tmp/mgend.json
```

ライブ検証スクリプトはこのMarkdownで使うテンプレート構文のみを処理する軽量ハーネスです。SPARQListサーバーそのものを起動した統合テストではありません。実際の配置後にもAPIの確認が必要です。

## 検証の範囲と制限

- 既定IDの照合と、逆鎖・別ALT・欠損・0・GRCh37・indelなどの回帰テストです。全NANDO IDでの網羅的検証ではありません。
- NANDOの直接のexactMatch/closeMatchのみを検索し、子疾患は展開しません。MGeNDはOMIM Phenotypic Series経由で、c.HGVS・位置・遺伝子情報が揃うレコードに限られます。
- indelの表現や転写産物バージョンが異なる場合、対応を確認できず補完情報が空になることがあります。
- TogoVarの検索は各座標100候補までです。大量結果のページングと並列数制限は未対応です。
- genotype countはデータセットごとの値の合計で、重複個体を除いた人数ではありません。
- MedGenに複数MONDOが対応する場合、現行の出力形式では1つのみ保持します。

## 追加の実データ検証（2026-09-23）

NANDO RDFの疾患名・ID対応を確認した上で、下記の3経路を全件実行しました。サンプリングによる取得ではありません。検証ハーネスのREST同時接続数を各実行4に制限し、APIの生データと途中結果をtraceに保存しました。本体SPARQListの並列数は変更していません。

| 疾患 / NANDO ID | 対象 | 出力行数 | REST照合成功 | 照合不成立 | 正のcountあり | 0のみあり | 両countがNo Data |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| ハンチントン病 / 1200012 | ClinVar | 9 | 3 | 6 | 1 | 1 | 7 |
| ファブリー病 / 1200157 | ClinVar | 847 | 259 | 588 | 8 | 27 | 812 |
| アルポート症候群 / 1200712 | MGeND | 288 | 288 | 0 | 2 | 0 | 286 |

「正のcountあり」は少なくとも一方が正数、「0のみあり」は正数がなく少なくとも一方が0、「両countがNo Data」はどちらも欠損の行です。各行は独立した個体やユニークな変異を意味しません。アルポート症候群の288行は144個のTogoVar IDに対応しました。

独立したPythonの監査処理で、全1,144行の表示countを生のfrequenciesから再計算し、一致を確認しました。REST照合が成立した550行は、染色体・位置・REF/ALTも一致しました。今回の照合成功例は置換であり、実データのindel・逆鎖の検証を網羅したものではありません。

具体例:

- ハンチントン病 `tgv15860454`：NCBNの `aac=12` によりAlt/Alt=12。`arc`等はなくRef/AltはNo Data。
- ハンチントン病 `tgv324309720`：NCBNの `aac=0` によりAlt/Alt=0。0を欠損にしていないことを確認。
- アルポート症候群 `tgv66819977`：Alt/AltはJGA SNP 1206 + NCBN 4 + JGA WGS 0 = **1210**。Ref/AltはJGA SNP 2026 + JGA WGS 0 = **2026**。他データセットにAC/AFのみがあってもcountへ変換していません。
- `tgv15859684` など、変異が一致しAC/AFがあってもgenotype countが提供されていなければNo Data。

### 追加検証で判明した制限

ClinVarの照合不成立は、ハンチントン病で「SPARQL側IDなし3行 / IDはあるがREST候補にない3行」、ファブリー病で「IDなし580行 / IDはあるがREST候補にない8行」でした。

ファブリー病の照合不成立588行のうち478行には、REST候補内に座標・REF/ALTが完全一致する候補がありました。ただし、その候補に現在の集計対象のcountフィールドはありませんでした。ハンチントン病でもIDなし2行にゲノム表現の完全一致候補がありましたが、countはありませんでした。したがって今回、この追加照合で数値を回復できる例は見つかっていません。

**照合できないことと、countが提供されていないことは異なります。現行表示では両方がNo Dataになるため、No Dataを「その遺伝型が0人」と解釈してはいけません。** 特に反復配列やindelは表現差もあり、この検証で同一性を確定できない例が残っています。

今回の目的は追加テストであり、本体の照合ロジックは変更していません。生データの代表例8件を回帰テストに追加し、既存9件と合わせて17件が成功しました。結果と代表的なfrequenciesは `tests/fixtures/live-audit-2026-09-23.json` に保存しています。

```sh
node --test tests/*.test.mjs
VARIANT_TRACE_PATH=/tmp/alport-trace.json node scripts/verify-variants-live.mjs 1200712 mgend /tmp/alport.json
python3 scripts/audit-variant-trace.py /tmp/alport-trace.json
```

ファブリー病のREST検索は686座標、実測約135秒でした。大量結果の処理時間にも注意が必要です。

## ClinVarのゲノム完全一致による補完（2026-09-24）

TogoVar IDが一致しない場合、SPARQLの変異URIからGRCh38の染色体・位置・REF/ALTを読み取り、REST候補の4項目が完全一致する場合にfrequenciesとMGeNDリンクを補完するよう変更しました。ID一致を優先します。完全一致候補が複数ある場合は補完しません。indelの正規化や塩基の推測は行いません。出力のTogoVar IDとリンクは従来どおりSPARQL由来の値を保持します。

9月23日に保存したREST生データを使って修正版の変換処理を再実行し、Python監査処理で確認しました（新たなライブ取得ではありません）。

| 疾患 | IDで一致 | ゲノム完全一致で追加 | 合計 | 未照合 |
| --- | ---: | ---: | ---: | ---: |
| ハンチントン病 | 3 | 2 | 5 / 9 | 4 |
| ファブリー病 | 259 | 478 | 737 / 847 | 110 |

追加候補には集計対象のgenotype countがないため、この2疾患の表示countは変更前と同一です。別染色体・位置・REF・ALTの除外、RESTのID欠損、ID一致優先、indelの完全一致、GRCh37の除外、複数候補の不採用を含め、回帰テスト22件が成功しました。

以前の節にあるIDのみでの照合件数は変更前の記録です。現在の監査スクリプトはゲノム完全一致による補完にも対応しています。サーバーへの配置は未実施です。

## countのfrequencyリンク（2026-09-24）

- 数値count（0を含む）に、照合先TogoVar変異の `#frequency` へのリンクを追加。JSONは `genotype_count_alt_alt_link` / `genotype_count_alt_ref_link` を返します。
- No Data、または照合先にTogoVar IDがない場合は空リンク。ゲノム照合でSPARQLのIDとRESTのIDが異なる場合は、count取得元であるRESTのIDをリンクに使います。
- ビューアの両タブのcount列にリンクを設定。新フィールドがまだない公開APIに対しては、数値countと既存のTogoVar IDからURLを生成します。APIが明示的に空リンクを返す場合は補完しません。
- `0, 欠損, 欠損` は0を維持し、「欠損を除いた合計」であることを画面に明記しました。
- 回帰テスト24件成功。ビューアの0・No Data・明示的空リンク・API指定リンクについて動作確認し、使用中の表コンポーネントが0にもリンクを付ける実装であることをソースで確認しました。公開サーバーへの反映は未実施です。

### No Dataのリンクを追加（2026-09-24）

上記のリンク条件を更新しました。countがNo DataでもTogoVar IDがあればfrequencyへのリンクを表示します。ClinVarは照合先RESTのIDを優先し、なければSPARQLのIDを使います。ビューアも旧APIの空リンクを既存TogoVar IDで補完します。IDがない場合のみリンクなしです。集計値は変更していません。更新した回帰テスト24件が成功しました。
