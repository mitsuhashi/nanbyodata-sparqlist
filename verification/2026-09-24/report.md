# SPARQListと公開サイト・TogoVarの比較検証

確認日：2026-09-24（日本時間）

この記録は2026-09-24時点のコードと外部データを対象とします。以後のレスポンス変更・ローカルテストは[2026-10-02の記録](../2026-10-02/report.md)を参照してください。

## 結論

1. **NANDO:1200216（遠位型ミオパチー）のバリアント一覧は、現在のSPARQListと公開サイトで一致しました。** ClinVarは8行、MGeNDは6行です。MGeNDの6行は同一変異の転写産物別HGVSであり、6種類の変異ではありません。
2. **ALT/ALT・REF/ALTのcountは、確認したTogoVarレコードの各データセットの値を合計した結果と一致しました。** TogoVarはデータセットごとに表示し、本SPARQListはそれらの欠損を除いて合計するため、単一データセットの数字と比較するものではありません。
3. `1200216`はすべてNo Dataです。MGeNDの対象変異については、TogoVarのfrequency画面もNo dataであることを確認しました。ClinVarにはRESTで同一レコードを特定できない行もあり、全行について「TogoVar側にcountがない」とは断定しません。

## 比較対象と方法

「現在のSPARQList」は、このリポジトリの [nanbyodata_get_variant_by_nando_id.md](../../nanbyodata_get_variant_by_nando_id.md)（コミット `fa07c36016906cdc50f9267255143c73384df6c2`）です。Markdown内の各SPARQL・JavaScriptブロックを検証ハーネスで実行し、当日の公開エンドポイントから取得しました。過去のfixtureを再利用した結果ではありません。

比較先は指定された[公開疾患ページのMGeND欄](https://nanbyodata.jp/disease/NANDO:1200216#variants-mgend)と[ClinVar欄](https://nanbyodata.jp/disease/NANDO:1200216#variants-clinvar)です。ブラウザでMGeNDの6行を確認し、[ページのJavaScript](https://nanbyodata.jp/static/js/disease/disease.js)が使用する次のAPIから全行を取得しました。開発用の `dev-nanbyodata.dbcls.jp` APIとの比較ではありません。

- [公開ClinVar API](https://nanbyodata.jp/sparqlist/api/nanbyodata_get_clinvar_variant_by_nando_id?nando_id=1200216)
- [公開MGeND API](https://nanbyodata.jp/sparqlist/api/nanbyodata_get_mgend_variant_by_nando_id?nando_id=1200216)

取得日時・コードのSHA-256・公開APIの全行・現在のSPARQListの全行・countの根拠を [evidence.json](evidence.json) に保存しました。SPARQListサーバーそのものを起動した統合テストや、サーバーへの配置は行っていません。

## 1. 公開サイトとのバリアント比較

| 対象 | 公開サイト | 現在のSPARQList | 比較キー | 結果 |
| --- | ---: | ---: | --- | --- |
| ClinVar | 8行 | 8行 | ClinVar accession | 追加・欠落なし。公開APIに存在する全フィールドが一致 |
| MGeND | 6行 | 6行 | HGVS・染色体・位置 | 追加・欠落なし。共通フィールドの差は内部のtypeのみ |

### MGeND：6行すべて一致

以下の6つのHGVSは、双方で染色体 **1**、位置 **78013109**、遺伝子 **DNAJB4**、分類 **Pathogenic**、`vtype=SNV`、`HGNC:14886`、`OMIMPS:160500`、`MONDO_0018949`が一致しました。

| HGVS | 公開サイト | 現在のSPARQList |
| --- | --- | --- |
| ENST00000370763.6:c.270T>A | あり | あり |
| NM_001317099.1:c.270T>A | あり | あり |
| NM_001317101.1:c.270T>A | あり | あり |
| NM_001317102.1:c.270T>A | あり | あり |
| NM_001317103.1:c.270T>A | あり | あり |
| NM_007034.4:c.270T>A | あり | あり |

現在のSPARQListでは、この6行に [tgv417499192](https://grch38.togovar.org/variant/tgv417499192#frequency)（GRCh38 `1:78013109 T>A`）が付与されます。

**JSONの差：** 公開APIの `type` は `Variant`、現在のSPARQListは `SNV`。ただし公開画面のVariant type列が使う `vtype` は双方とも `SNV` で、表示内容は一致します。公開APIにはTogoVar ID・genotype count・frequencyリンクがなく、現在のSPARQListがこれらを追加しています。

### ClinVar：8行すべて一致

| ClinVar accession | GRCh38位置 | TogoVar ID（SPARQL由来） |
| --- | --- | --- |
| VCV000351146 | 5:139329477 | tgv22949086 |
| VCV000351148 | 5:139329569 | tgv200780918 |
| VCV000351177 | 5:139331202 | tgv338127495 |
| VCV000351117 | 5:139307308 | tgv22947906 |
| VCV000351139 | 5:139326289 | なし |
| VCV000369449 | 5:139273746 | なし |
| VCV000584450 | 12:119193786 | なし |
| VCV002683801 | 12:54284307 | なし |

上記に加え、HGVSタイトル・分類・型・MedGen・MONDO・リンクも、公開APIにあるフィールドについて全件一致しました。現在のSPARQListにはcount等の追加フィールドがあるため、JSON全体が同一という意味ではありません。

## 2. ALT/ALT・REF/ALTとTogoVarの照合

### 判定方法

TogoVar REST検索の対象レコードを特定し、`frequencies`をPythonで独立に再集計してSPARQListの出力と比較しました。

- ALT/ALT：`genotype.alt_homo_count`、未定義またはnullなら`aac`。
- REF/ALT：`genotype.hetero_count`、未定義またはnullなら`arc`。
- 数値だけを合計。0は有効。すべて欠損ならNo Data。AC・AF・Hemi_Altから推定しません。
- TogoVar画面の **Alt / Ref** と、このSPARQListの **REF/ALT** は同じ対象です。

| 入力 | 行数 | 同一RESTレコードを特定 | 未照合 | count再計算と出力 |
| --- | ---: | ---: | ---: | --- |
| 1200216 / ClinVar | 8 | 2 | 6 | 8行とも一致。ただし未照合6行はNo Dataの処理を確認しただけ |
| 1200216 / MGeND | 6 | 6 | 0 | 6行とも一致 |
| 1200012 / ClinVar（数値・0の確認用） | 9 | 5 | 4 | 9行とも一致。未照合4行は同様に限定 |
| 1200712 / MGeND（両countの数値確認用） | 288 | 288 | 0 | 288行とも一致 |

計311行で集計処理の不一致はありませんでした。REST照合が成立した301行ではゲノムの染色体・位置・REF/ALTも確認しました。残る10行を「TogoVarと同一countを確認済み」とは扱いません。

### 指定疾患のMGeND：tgv417499192

[TogoVar frequency](https://grch38.togovar.org/variant/tgv417499192#frequency)をブラウザで確認した結果、表は **No data** でした。RESTの対象レコードにもfrequenciesはありませんでした。

| 項目 | TogoVar | 現在のSPARQList | 判定 |
| --- | --- | --- | --- |
| ALT/ALT | データなし | No Data（6行） | 一致 |
| REF/ALT | データなし | No Data（6行） | 一致 |

### 数値がある例：tgv66819977（NANDO:1200712 / MGeND）

[TogoVar frequency](https://grch38.togovar.org/variant/tgv66819977#frequency)をブラウザで開き、各データセットのGenotype countを確認しました。RESTの値とも一致しています。

| データセット | TogoVar ALT/ALT | TogoVar Alt/Ref | 集計への寄与 |
| --- | ---: | ---: | --- |
| JGA-SNP | 1206 | 2026 | 両方を加算 |
| NCBN | 4 | 欠損 | ALT/ALTのみ加算 |
| JGA-WGS | 0 | 0 | 0として加算 |
| GEM-J WGA / ToMMo / gnomAD Genomes / gnomAD Exomes | 欠損 | 欠損 | 加算しない |
| **合計** | **1210** | **2026** | **SPARQListの出力と一致** |

NCBNに表示される **69はHemi_Alt** であり、REF/ALTへ加算しません。TogoVarは合計行を提供していないため、1210・2026は上記データセット別の値から算出した比較値です。同じ変異の転写産物別2行に同じ合計が表示されます。

### 正数・0の追加確認（TogoVar RESTとの比較）

| NANDO | TogoVar | 数値の根拠 | SPARQList ALT/ALT | SPARQList REF/ALT | 判定 |
| --- | --- | --- | ---: | --- | --- |
| 1200012 | [tgv15860454](https://grch38.togovar.org/variant/tgv15860454#frequency) | NCBN aac=12。arcは欠損 | 12 | No Data | 一致 |
| 1200012 | [tgv324309720](https://grch38.togovar.org/variant/tgv324309720#frequency) | NCBN aac=0。arcは欠損 | 0 | No Data | 一致 |

この2例は当日のREST生データで確認しました。ブラウザのfrequency画面を直接確認した例は、上記の `tgv417499192` と `tgv66819977` です。

## 再実行と制限

```sh
node --test tests/*.test.mjs
VARIANT_TRACE_PATH=/tmp/current-mgend-trace.json node scripts/verify-variants-live.mjs 1200216 mgend /tmp/current-mgend.json
VARIANT_TRACE_PATH=/tmp/current-clinvar-trace.json node scripts/verify-variants-live.mjs 1200216 clinvar /tmp/current-clinvar.json
python3 scripts/audit-variant-trace.py /tmp/current-mgend-trace.json /tmp/current-clinvar-trace.json
```

Node.js 18以降、Python 3、curl、公開APIへの接続が必要です。公開サイトの比較用APIは「比較対象と方法」のリンクを使用します。行順ではなく上記の比較キーで照合してください。

- 公開サイトとのバリアント集合の比較はNANDO:1200216の2経路が対象です。全疾患で一致することを保証するものではありません。
- No Dataは「countが未提供」と「変異を照合できない」の両方を含みます。0人とは解釈できません。
- `0, 欠損, 欠損`は0ですが、欠損データセットの不在を確認した意味ではありません。
- データセット間の重複個体は除去していないため、合計はユニーク人数ではありません。転写産物別の行を再合計してはいけません。
- 現在の検索はNANDOの直接のexactMatch/closeMatchのみ。子疾患は展開せず、MGeNDはOMIM Phenotypic Series経由の所定フィールドが揃うレコードに限定されます。
- RESTは1座標100候補まで。indel表現差などにより未照合が残ります。
- APIデータは更新されるため、将来の再実行結果が変わる可能性があります。

過去の修正経緯・旧照合件数は[以前の検証記録](../history-through-2026-09-24.md)に分離しました。本書の比較結果は上記確認日時点のものです。
