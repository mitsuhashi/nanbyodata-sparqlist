# Get variant data in ClinVar or MGeND

## Parameters

* `nando_id` NANDO ID
  * default: 1200216
  * examples: 1200216 (variant in both clinvar and mgend) 
* `target` target database (either clinvar or mgend)
  * default: clinvar
  * examples: clinvar mgend
  
## Endpoint

https://dev-nanbyodata.dbcls.jp/sparql

## `nando2mondo2medgen`
```sparql
PREFIX nando: <http://nanbyodata.jp/ontology/NANDO_>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX mo: <http://med2rdf/ontology/medgen#>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT DISTINCT ?mondo ?medgen_cid 
WHERE {
  GRAPH <https://nanbyodata.jp/rdf/ontology/nando> {
    nando:{{nando_id}} skos:exactMatch | skos:closeMatch ?mondo .
  }
  GRAPH <https://nanbyodata.jp/rdf/medgen> { 
    ?medgen_uri
      dct:identifier ?medgen_cid ;
      mo:mgconso ?mgconso .
    ?mgconso
      dct:source mo:MONDO ;
      rdfs:seeAlso ?mondo.
  }
}
 ```
 ## `medgen`
 ```javascript
({nando2mondo2medgen}) => {
  return nando2mondo2medgen.results.bindings.map(b => b.medgen_cid.value);
}

```

## `medgen2togovar`

```javascript
async ({target, medgen_cid, medgen}) => {
  let query = {
    query: {
      disease: {
      "relation": "eq",
      "terms": medgen.map(b => b.replace("http://ncbi.nlm.nih.gov/medgen/",""))
      }
    }
  };

  let response = await fetch('https://grch38.togovar.org/api/search/variant.json', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(query)
  }).then(res => res.json());
  
  const variants = response.data;

  if (!Array.isArray(variants)) {
    throw new Error(`Expected array response, got: ${JSON.stringify(response)}`);
  }
  
 
  return variants.filter(x =>
    x.significance?.some(entry =>
      entry.source === target &&
      entry.conditions?.some(cond => cond.meden === medgen_cid)
    )
  );
}
```

## `display_medgen2togovar`
```javascript
({medgen2togovar}) => {
　console.log(medgen2togovar)
}
```

## `result`
```javascript
({target, medgen, medgen2togovar, nando2mondo2medgen}) => {
  const medgen_cids = medgen.map(b => b.replace("http://ncbi.nlm.nih.gov/medgen/",""))

  return medgen_cids.flatMap(medgen_cid => {
    return medgen2togovar
      .map(x => {
        const tgv_id = x.id ? x.id : "";
        const tgv_link = tgv_id ? "https://grch38.togovar.org/variant/" + tgv_id : "";
        const position = x.chromosome + ":" + x.position;
        const title = x.title?.value;
        const external_link = target == "clinvar" ? x.external_link.clinvar[0]?.xref : x.external_link.mgend[0]?.xref;
        const external_id = target == "clinvar" ? x.external_link.clinvar[0]?.title : x.external_link.mgend[0]?.title
        const interpretations = x.significance?.interpretations?.join(", ");
   
        const type = x.type
        const mondo = nando2mondo2medgen.results.bindings[0].mondo.value;
        
        const total_aac = x.frequencies?.reduce((sum, record) => {
          return sum + (record.aac || 0);
        }, 0);

        const total_arc = x.frequencies?.reduce((sum, record) => {
          return sum + (record.arc || 0);
        }, 0);

        if (target == "mgend"){
          return {
            tgv_id: tgv_id,
            tgv_link: tgv_link,
            position: position,
            title: title,
            external_link: external_link,
            external_id: external_id,
            Interpretation: interpretations,
            type: type,
            MedGen_id: medgen_cid,
            MedGen_link: "http://ncbi.nlm.nih.gov/medgen/" + medgen_cid,
            mondo: mondo,
            mondo_id: mondo.replace("http://purl.obolibrary.org/obo/", ""),
            num_homozygous: total_aac > 0 ? total_aac : "No Data",
            num_heterozygous: total_arc > 0 ? total_arc : "No Data"
          };
        }else {
          return {
            tgv_id: tgv_id,
            tgv_link: tgv_link,
            position: position,
            title: title,
            Clinvar_link: external_link,
            ClinVar_id: external_id,
            Interpretation: interpretations,
            type: type,
            MedGen_id: medgen_cid,
            MedGen_link: "http://ncbi.nlm.nih.gov/medgen/" + medgen_cid,
            mondo: mondo,
            mondo_id: mondo.replace("http://purl.obolibrary.org/obo/", ""),
            num_homozygous: total_aac > 0 ? total_aac : "No Data",
            num_heterozygous: total_arc > 0 ? total_arc : "No Data"
          };
        }
      });
  });
}
```

## Description
- TogoVarの情報をVirtuosoではなくTogoVarAPIから取得するように変更 三橋 (2025/7/10)
  - num_homozygousとnum_heterozygousはTogoVarに搭載されているデータセットで1以上の数字があれば合計を返します。欠損値が多いのであるデータセットで0であっても「No Data」とします。
- MedGenのRDFの形式が変わったことによる変更 2024/12/05
- NANDO改変に伴う変更　2024/11/22
- APIの名前の変更（2024/06/27)
- NanbyoDataでヴァリアントの情報を表示させるために利用しているSPARQListです。
- Togovarのエンドポイントを利用しています。
- SPARQListの大元はTogovarから頂いています。
- NANDOからMONDO,MONDOからMedGenのIDに変更して、Clinvarのデータを取得しています。
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
    "genelabel": "DNAJB4",
    "hgncurl": "http://identifiers.org/hgnc:14886",
    "hgncID": "HGNC:14886"
  },
  ```