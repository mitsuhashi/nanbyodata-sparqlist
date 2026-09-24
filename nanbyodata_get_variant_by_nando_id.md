# Get variant data in ClinVar or MGeND

## Parameters

* `nando_id` NANDO ID
  * default: 1200216
  * examples: 1200216 (variant in both clinvar and mgend)
* `target` target database (either clinvar or mgend)
  * default: clinvar
  * examples: clinvar mgend

## `input`

NANDO ID と対象を検証・正規化します。`NANDO:1200216` / `NANDO_1200216` と大文字の対象名も受け付けます。従来の `medgen` は `mgend` の別名として扱います。

```javascript
({nando_id, target}) => {
  const id = String(nando_id || "1200216").trim().replace(/^NANDO[:_]/i, "");
  let database = String(target || "clinvar").trim().toLowerCase();
  if (database === "medgen") database = "mgend";
  if (!/^\d{7}$/.test(id)) throw new Error("nando_id must be a 7-digit NANDO ID");
  if (!["clinvar", "mgend"].includes(database)) {
    throw new Error("target must be clinvar or mgend");
  }
  return {nando_id: id, target: database};
}
```

## Endpoint
https://nanbyodata.jp/sparql

## `nando2mondo2omim`

先に対象疾患のMONDOとOMIM Phenotypic Seriesを確定します。大きなMGeNDグラフとの結合前に検索対象を絞ります。

```sparql
PREFIX nando: <http://nanbyodata.jp/ontology/NANDO_>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX oboInOwl: <http://www.geneontology.org/formats/oboInOwl#>
SELECT DISTINCT ?mondo ?omimuri
WHERE {
  FILTER ("{{input.target}}" = "mgend")
  GRAPH <https://nanbyodata.jp/rdf/ontology/nando> {
    nando:{{input.nando_id}} skos:exactMatch | skos:closeMatch ?mondo .
  }
  GRAPH <https://nanbyodata.jp/rdf/ontology/mondo> {
    ?mondo oboInOwl:hasDbXref ?xref .
    FILTER STRSTARTS(STR(?xref), "OMIMPS:")
    BIND(IRI(REPLACE(STR(?xref), "OMIMPS:", "https://omim.org/phenotypicSeries/PS")) AS ?omimuri)
  }
}
```

## `nando2mondo2mgend`

`target=mgend` のときに、NANDO ID から MONDO を経由して MGeND のバリアント候補を取得します。OMIM Phenotypic Series、HGVS、染色体、位置、遺伝子などを NanbyoData RDF から取得します。

```sparql

PREFIX nando: <http://nanbyodata.jp/ontology/NANDO_>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX mo: <http://med2rdf/ontology/medgen#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX oboInOwl: <http://www.geneontology.org/formats/oboInOwl#>
PREFIX faldo: <http://biohackathon.org/resource/faldo#>
PREFIX mgendo: <http://med2rdf.org/mgend/ontology#>
PREFIX m2r: <http://med2rdf.org/ontology/med2rdf#>

SELECT DISTINCT ?dbxref ?omimps ?mondo ?mondolabel ?significance ?type ?variantID ?hgvs ?vtype ?position ?ch ?mgendogeneID ?genelabel ?geneXref
WHERE {
  {{#if nando2mondo2omim.results.bindings.length}}
  FILTER ("{{input.target}}" = "mgend")
  VALUES (?mondo ?omimuri) {
    {{#each nando2mondo2omim.results.bindings}}
      (<{{mondo.value}}> <{{omimuri.value}}>)
    {{/each}}
  }
  GRAPH <https://nanbyodata.jp/rdf/ontology/mondo> {
    ?mondo rdfs:label ?mondolabel;
    oboInOwl:hasDbXref ?dbxref.
    FILTER (lang(?mondolabel) = "")
    FILTER contains(?dbxref,'OMIMPS')
    BIND(REPLACE(?dbxref,'OMIMPS:','https://omim.org/phenotypicSeries/PS') AS ?omimps)
  }
  FILTER (IRI(?omimps) = ?omimuri)
   GRAPH <https://nanbyodata.jp/rdf/mgend> {
    ?mgendcase rdfs:seeAlso ?omimuri.
    ?mgendcase mgendo:case_significance ?significance;
               mgendo:variant_type ?type;
               mgendo:variant ?variantID.
    ?variantID rdf:type ?vtype;
               skos:note ?hgvs;
               faldo:location ?blank1.
    FILTER CONTAINS(?hgvs,":c.")
    ?blank1 faldo:position ?position;
               faldo:reference ?ch.
    ?variantID m2r:gene ?mgendogeneID.
    ?mgendogeneID rdfs:label ?genelabel;
                  rdfs:seeAlso ?geneXref.
  }
  {{else}}
  FILTER (false)
  {{/if}}
}
```

## `nando2mondo2medgen`

`target=clinvar` のときに、NANDO ID から MONDO を経由して MedGen ID を取得します。ClinVar は疾患条件を MedGen ID で参照しているため、この後の ClinVar 検索に使います。

```sparql
PREFIX nando: <http://nanbyodata.jp/ontology/NANDO_>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX mo: <http://med2rdf/ontology/medgen#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT DISTINCT ?mondo ?medgen_id ?medgen_cid
WHERE {
  FILTER ("{{input.target}}" = "clinvar")
  GRAPH <https://nanbyodata.jp/rdf/ontology/nando> {
    nando:{{input.nando_id}} skos:exactMatch | skos:closeMatch ?mondo .
  }
  GRAPH <https://nanbyodata.jp/rdf/medgen> {
    ?medgen_uri
    dct:identifier ?medgen ;
    mo:mgconso ?mgconso .
    ?mgconso
    dct:source mo:MONDO ;
    rdfs:seeAlso ?mondo.
    BIND (CONCAT("http://ncbi.nlm.nih.gov/medgen/",?medgen) AS ?medgen_id)
    BIND (IRI(?medgen_id) AS ?medgen_cid)
  }
}
```

## `medgen`

`nando2mondo2medgen` の結果から MedGen URI だけを配列にします。次の TogoVar SPARQL クエリの `VALUES` 句に渡します。

```javascript
({nando2mondo2medgen}) => {
  return [...new Set(nando2mondo2medgen.results.bindings.map(b => b.medgen_cid.value))];
}
```

## Endpoint
https://grch38.togovar.org/sparql

## `medgen2clinvar2togovar`

MedGen ID に紐づく ClinVar のバリアントを TogoVar SPARQL から取得します。ClinVar accession、HGVS、interpretation、TogoVar ID、variant type、ゲノム上の位置を取得します。

```sparql
PREFIX cvo:    <http://purl.jp/bio/10/clinvar/>
PREFIX dct:    <http://purl.org/dc/terms/>
PREFIX medgen: <http://ncbi.nlm.nih.gov/medgen/>
PREFIX rdf:    <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs:   <http://www.w3.org/2000/01/rdf-schema#>
PREFIX sio:    <http://semanticscience.org/resource/>
PREFIX tgvo:   <http://togovar.biosciencedbc.jp/vocabulary/>

SELECT DISTINCT ?tgv_id ?variant ?title ?condition ?clinvar ?vcv ?type ?med_id ?interpretation
WHERE {
  VALUES ?med_id { {{#each medgen}} <{{this}}> {{/each}} }

  GRAPH <http://togovar.org/clinvar> {
    ?med_id ^dct:references ?_classified_condition .

    ?_classified_condition ^cvo:classified_condition/^cvo:classified_condition_list ?_rcv ;
      rdfs:label ?condition .

    ?_rcv cvo:rcv_classifications/cvo:germline_classification/cvo:description/cvo:description ?interpretation ;
      ^cvo:rcv_accession/^cvo:rcv_list/^cvo:classified_record ?clinvar .

    ?clinvar a cvo:VariationArchiveType ;
      rdfs:label ?title ;
      cvo:accession ?vcv ;
      cvo:variation_id ?vid .

    BIND(STR(?vid) AS ?variation_id)
  }

  GRAPH <http://togovar.org/variant/annotation/clinvar> {
    ?variant dct:identifier ?variation_id .
  }

  GRAPH <http://togovar.org/variant> {
    OPTIONAL {
      ?variant dct:identifier ?tgv_id ;
               rdf:type ?type.
    }
  }
}
```

## `togovar`

MGeND 由来のバリアント位置を使って TogoVar REST API を呼びます。SPARQL だけでは取れない TogoVar ID、MGeND URL、ClinVar URL、genotype count などを補完するために使います。

```javascript
async ({nando2mondo2mgend}) => {
  const variants = nando2mondo2mgend.results.bindings;
  const locations = [...new Map(variants.map(d => {
    if (!/\/GRCh38$/.test(d.ch.value)) return null;
    const chromosomeParts = d.ch.value.split('/');
    const chromosome = chromosomeParts[chromosomeParts.length - 2];
    const position = Number(d.position.value);
    return [`${chromosome}:${position}`, {chromosome, position}];
  }).filter(Boolean)).values()];

  const responses = await Promise.all(locations.map(async location => {
    const response = await fetch('https://grch38.togovar.org/api/search/variant?stat=0', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: {location},
        limit: 100
      })
    });

    if (!response.ok) {
      throw new Error(`TogoVar API returned ${response.status} for ${location.chromosome}:${location.position}`);
    }

    const body = await response.json();
    return [`${location.chromosome}:${location.position}`, body.data || []];
  }));

  return Object.fromEntries(responses);
}
```

## `clinvar_togovar`

ClinVar 由来のバリアント位置を使って TogoVar REST API を呼びます。SPARQL だけでは取れない genotype count と MGeND 外部リンクを補完するために使います。

```javascript
async ({medgen2clinvar2togovar}) => {
  const locations = [...new Map(medgen2clinvar2togovar.results.bindings
    .map(d => {
      const positionMatch = d.variant && d.variant.value
        ? d.variant.value.match(/http:\/\/identifiers.org\/hco\/(.+)\/GRCh38#(\d+)/)
        : null;
      if (!positionMatch) {
        return null;
      }

      const chromosome = positionMatch[1];
      const position = Number(positionMatch[2]);
      return [`${chromosome}:${position}`, {chromosome, position}];
    })
    .filter(Boolean)
  ).values()];

  const responses = await Promise.all(locations.map(async location => {
    const response = await fetch('https://grch38.togovar.org/api/search/variant?stat=0', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: {location},
        limit: 100
      })
    });

    if (!response.ok) {
      throw new Error(`TogoVar API returned ${response.status} for ${location.chromosome}:${location.position}`);
    }

    const body = await response.json();
    return [`${location.chromosome}:${location.position}`, body.data || []];
  }));

  return Object.fromEntries(responses);
}
```

## `clinvar_variants`

ClinVar SPARQL の結果と TogoVar REST API の結果を統合し、最終的な ClinVar 用 JSON に整形します。TogoVar REST API から genotype count と MGeND URL も追加します。

```javascript
({medgen2clinvar2togovar, nando2mondo2medgen, clinvar_togovar}) => {
  const medgen2mondo = {};
  nando2mondo2medgen.results.bindings.forEach(x => {
    medgen2mondo[x.medgen_id.value] = x.mondo.value;
  });

  return medgen2clinvar2togovar.results.bindings.map(x => {
    const positionMatch = x.variant && x.variant.value
      ? x.variant.value.match(/http:\/\/identifiers.org\/hco\/(.+)\/GRCh38#(\d+)/)
      : null;
    const position = positionMatch ? positionMatch[1] + ":" + positionMatch[2] : "";
    const tgv_id = x.tgv_id && x.tgv_id.value ? x.tgv_id.value : "";
    const medgenUri = x.med_id && x.med_id.value ? x.med_id.value : "";
    const mondo = medgenUri && medgen2mondo[medgenUri] ? medgen2mondo[medgenUri] : "";
    const variantsAtLocation = clinvar_togovar[position] || [];
    // IDを優先し、見つからない場合だけGRCh38のゲノム表現で完全一致を確認する。
    // indelの正規化やREF/ALTの推測はしない。複数候補なら補完しない。
    const genomic = x.variant?.value.match(/^https?:\/\/identifiers\.org\/hco\/([^/]+)\/GRCh38#(\d+)-([ACGT]+)-([ACGT]+)$/);
    const idMatch = tgv_id ? variantsAtLocation.find(variant => variant.id === tgv_id) : undefined;
    const genomicMatches = !idMatch && genomic ? variantsAtLocation.filter(variant =>
      String(variant.chromosome) === genomic[1]
      && Number(variant.position) === Number(genomic[2])
      && variant.reference === genomic[3]
      && variant.alternate === genomic[4]
    ) : [];
    const togovarVariant = idMatch || (genomicMatches.length === 1 ? genomicMatches[0] : undefined);
    const frequencyId = togovarVariant?.id || tgv_id;
    const frequencyLink = frequencyId
      ? `https://grch38.togovar.org/variant/${frequencyId}#frequency`
      : "";
    const frequencies = togovarVariant?.frequencies || [];
    const altAltCounts = frequencies
      .map(record => record.genotype?.alt_homo_count ?? record.aac)
      .filter(Number.isFinite);
    const altRefCounts = frequencies
      .map(record => record.genotype?.hetero_count ?? record.arc)
      .filter(Number.isFinite);
    const mgendLink = togovarVariant?.external_link?.mgend?.[0];

    return {
      source: "clinvar",
      tgv_id: tgv_id,
      tgv_link: tgv_id ? "https://grch38.togovar.org/variant/" + tgv_id : "",
      position: position,
      title: x.title && x.title.value ? x.title.value : "",
      Clinvar_link: x.clinvar && x.clinvar.value ? x.clinvar.value : "",
      Clinvar_id: x.vcv && x.vcv.value ? x.vcv.value : "",
      ClinVar_id: x.vcv && x.vcv.value ? x.vcv.value : "",
      Interpretation: x.interpretation && x.interpretation.value ? x.interpretation.value : "",
      type: x.type && x.type.value ? x.type.value.replace("http://genome-variation.org/resource#", "") : "",
      MedGen_id: medgenUri ? medgenUri.replace("http://ncbi.nlm.nih.gov/medgen/", "") : "",
      MedGen_link: medgenUri,
      mondo: mondo,
      mondo_id: mondo ? mondo.replace("http://purl.obolibrary.org/obo/MONDO_", "MONDO:") : "",
      mondo_url: mondo,
      genotype_count_alt_alt_link: frequencyLink,
      genotype_count_alt_ref_link: frequencyLink,
      genotype_count_alt_alt: altAltCounts.length > 0
        ? altAltCounts.reduce((sum, count) => sum + count, 0)
        : "No Data",
      genotype_count_alt_ref: altRefCounts.length > 0
        ? altRefCounts.reduce((sum, count) => sum + count, 0)
        : "No Data",
      mgend_id: mgendLink?.title || "",
      mgend_url: mgendLink?.xref || ""
    };
  });
}
```

## `mgend_variants`

MGeND SPARQL の結果と TogoVar REST API の結果を統合し、最終的な MGeND 用 JSON に整形します。TogoVar REST API から TogoVar ID、MGeND URL、ClinVar URL、genotype count も追加します。

```javascript
({nando2mondo2mgend, togovar}) => {
  let tree = [];
  nando2mondo2mgend.results.bindings.forEach(d => {
    let urlPartsCh = d.ch.value.split('/'); // chのURLをスラッシュで分割
    let chromosomeNumber = urlPartsCh[urlPartsCh.length - 2]; // 最後から2番目の要素が染色体番号

    let urlPartsVtype = d.vtype.value.split('/'); // vtypeのURLをスラッシュで分割
    let variantType = urlPartsVtype[urlPartsVtype.length - 1]; // 最後の要素が変異タイプ

    // c.HGVS は逆鎖の場合にゲノムのREF/ALTと異なる。ゲノムURIを使う。
    const genomic = d.variantID.value.match(/\/GRCh38_chr([^_]+)_(\d+)_(\d+)_([ACGT]+)_([ACGT]+)$/i);
    const variantsAtLocation = /\/GRCh38$/.test(d.ch.value)
      ? togovar[`${chromosomeNumber}:${d.position.value}`] || []
      : [];
    const togovarVariant = variantsAtLocation.find(variant => {
      if (String(variant.chromosome) !== chromosomeNumber || Number(variant.position) !== Number(d.position.value)) {
        return false;
      }
      // 置換のみREF/ALTを直接比較する。indelは正規化が異なり得るためHGVSの完全一致を使う。
      if (genomic && genomic[4].length === genomic[5].length) {
        return genomic[1] === chromosomeNumber && Number(genomic[2]) === Number(variant.position)
          && variant.reference === genomic[4].toUpperCase()
          && variant.alternate === genomic[5].toUpperCase();
      }
      return (variant.transcripts || []).some(transcript => transcript.hgvs_c === d.hgvs.value);
    });
    const frequencyLink = togovarVariant?.id
      ? `https://grch38.togovar.org/variant/${togovarVariant.id}#frequency`
      : "";
    const frequencies = togovarVariant?.frequencies || [];
    const altAltCounts = frequencies
      .map(record => record.genotype?.alt_homo_count ?? record.aac)
      .filter(Number.isFinite);
    const altRefCounts = frequencies
      .map(record => record.genotype?.hetero_count ?? record.arc)
      .filter(Number.isFinite);
    const mgendLink = togovarVariant?.external_link?.mgend?.[0];
    const clinvarLink = togovarVariant?.external_link?.clinvar?.[0];
    const clinvarSignificance = (togovarVariant?.significance || [])
      .filter(entry => entry.source === "clinvar");
    const interpretationLabels = {
      P: "Pathogenic",
      LP: "Likely pathogenic",
      B: "Benign",
      LB: "Likely benign",
      VUS: "Uncertain significance"
    };
    const interpretations = [...new Set(clinvarSignificance.flatMap(entry =>
      (entry.interpretations || []).map(value => interpretationLabels[value] || value)
    ))];
    const titleTranscript = (togovarVariant?.transcripts || []).find(transcript =>
      transcript.hgvs_c && transcript.transcript_id?.startsWith("NM_")
    ) || (togovarVariant?.transcripts || []).find(transcript => transcript.hgvs_c);
    const titleHgvs = titleTranscript?.hgvs_c || "";
    const titleParts = titleHgvs.split(":");
    const title = titleParts.length > 1
      ? `${titleParts.shift()}(${d.genelabel.value}):${titleParts.join(":")}`
      : titleHgvs;

    tree.push({
      source: "mgend",
      omim_id: d.dbxref.value,
      omim_url: d.omimps.value,
      mondo_id: d.mondo.value,
      mondo_label: d.mondolabel.value,
      mondo_url: d.mondo.value.replace("MONDO:", "https://monarchinitiative.org/MONDO:"),
      significance: d.significance.value,
      type: variantType,
      hgvs: d.hgvs.value,
      vtype: variantType, // 修正した変異タイプ
      position: d.position.value,
      ch: chromosomeNumber, // 修正した染色体番号
      tgv_id: togovarVariant?.id || "",
      tgv_link: togovarVariant?.id ? `https://grch38.togovar.org/variant/${togovarVariant.id}` : "",
      genotype_count_alt_alt_link: frequencyLink,
      genotype_count_alt_ref_link: frequencyLink,
      genotype_count_alt_alt: altAltCounts.length > 0
        ? altAltCounts.reduce((sum, count) => sum + count, 0)
        : "No Data",
      genotype_count_alt_ref: altRefCounts.length > 0
        ? altRefCounts.reduce((sum, count) => sum + count, 0)
        : "No Data",
      mgend_id: mgendLink?.title || "",
      mgend_url: mgendLink?.xref || "",
      title: title,
      Clinvar_link: clinvarLink?.xref || "",
      ClinVar_id: clinvarLink?.title || "",
      Interpretation: interpretations.join(", "),
      genelabel: d.genelabel.value,
      hgncurl: d.geneXref.value,
      hgncID: d.geneXref.value.replace("http://identifiers.org/hgnc:","HGNC:")
    });
  });
  return tree;
};
```

## `variants`

`target` パラメータに応じて、ClinVar 用の結果または MGeND 用の結果を選択します。検証・正規化済みの対象名に基づいて返します。

```javascript
({input, clinvar_variants, mgend_variants}) => {
  return input.target === "mgend" ? mgend_variants : clinvar_variants;
}
```

## Output

選択済みの `variants` を JSON として返します。

```javascript
({variants}) => variants
```

## Description
- countは欠損を除いたデータセットの合計です。0と欠損のみの場合は0、すべて欠損または照合不可の場合は「No Data」です。0は全データセットでの不在を意味しません。
- `genotype_count_alt_alt_link` / `genotype_count_alt_ref_link` は、TogoVar IDがある場合に、その変異の `#frequency` URLを返します。数値・0・No Dataのすべてがリンク対象です。ClinVarではREST側のIDを優先し、なければSPARQL側のIDを使います。どちらにもIDがない場合は空文字です。
- ClinVar / MGeND の疾患関連レコードを取得します。結果は転写産物・疾患・分類ごとの行を含み、行数はユニークな変異数ではありません。
- NANDOの直接のexactMatch / closeMatchを対象とします。子疾患は展開しません。MGeNDはMONDOのOMIM Phenotypic Series経由で、c.HGVS・位置・遺伝子情報が揃うレコードに限定されます。全関連変異を網羅する検索ではありません。
- TogoVar REST APIとの照合はGRCh38を対象とします。一致が確認できない補完情報は空文字または「No Data」とします。

## Description
- TogoVarの情報をVirtuosoではなくTogoVarAPIから取得するように変更 三橋 (2025/7/10)
  - genotype_count_alt_alt と genotype_count_alt_ref は、TogoVarの各データセットに明示された数値を合計します。0は0として扱い、数値がない場合のみ「No Data」を返します。データセット間の重複個体は除外していないため、ユニークな人数ではありません。
- [Distal myopathy (C0751336)](https://grch38.togovar.org/disease/C0751336) をClinVarとMGeNDの両方にある例とする。
- MedGenのRDFの形式が変わったことによる変更 2024/12/05
- NANDO改変に伴う変更　2024/11/22
- APIの名前の変更（2024/06/27)
- NanbyoDataでヴァリアントの情報を表示させるために利用しているSPARQListです。
- Togovarのエンドポイントを利用しています。
- SPARQListの大元はTogovarから頂いています。
- NANDOからMONDO,MONDOからMedGenのIDに変更して、ClinVarのデータを取得しています。
- 編集：高月（2024/01/12)
- レスポンス例
　- clinvar
 ```
  {
    "tgv_id": "tgv398044273",
    "tgv_link": "https://grch38.togovar.org/variant/tgv398044273",
    "position": "17:15259199",
    "title": "NM_000304.4(PMP22):c.79-6C>T",
    "Clinvar_link": "http://ncbi.nlm.nih.gov/clinvar/variation/321862",
    "Clinvar_id": "VCV000321862",
    "Interpretation": "Benign",
    "type": "SNV",
    "MedGen_id": "C4083008",
    "MedGen_link": "http://ncbi.nlm.nih.gov/medgen/C4083008",
    "mondo": "http://purl.obolibrary.org/obo/MONDO_0007691",
    "mondo_id": "MONDO:0007691"
  },
  ```
  - mgend
  ```
  {
    "omim_id": "OMIMPS:160500",
    "omim_url": "https://omim.org/phenotypicSeries/PS160500",
    "mondo_id": "http://purl.obolibrary.org/obo/MONDO_0018949",
    "mondo_label": "distal myopathy",
    "mondo_url": "http://purl.obolibrary.org/obo/MONDO_0018949",
    "significance": "Pathogenic",
    "type": "Variant",
    "hgvs": "ENST00000370763.6:c.270T>A",
    "vtype": "SNV",
    "position": "78013109",
    "ch": "1",
    "tgv_id": "tgv417499192",
    "tgv_link": "https://grch38.togovar.org/variant/tgv417499192",
    "genotype_count_alt_alt": "No Data",
    "genotype_count_alt_ref": "No Data",
    "mgend_id": "SNV|hg38|chr1:78013109-78013109|gT>A",
    "mgend_url": "https://mgend.jihs.go.jp/variant/info/SNV|hg38|chr1:78013109-78013109|gT>A",
    "genelabel": "DNAJB4",
    "hgncurl": "http://identifiers.org/hgnc:14886",
    "hgncID": "HGNC:14886"
  },
  ```
