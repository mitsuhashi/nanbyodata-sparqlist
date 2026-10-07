# Get variant data in ClinVar

## Parameters

* `nando_id` NANDO ID
  * default:
  * examples: 1200030（ギランバレー症候群、TogoVarにバリアントがない例を含む）、1200183 (TogoVar(tgv40123502)が存在する例)
  
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

SELECT DISTINCT ?mondo ?medgen_id ?medgen_cid 
WHERE {
  GRAPH <https://nanbyodata.jp/rdf/ontology/nando> {
    nando:{{nando_id}} skos:exactMatch | skos:closeMatch ?mondo .
  }
  GRAPH <https://nanbyodata.jp/rdf/medgen> { 
    ?medgen_uri
    dct:identifier ?medgen ;
    mo:mgconso ?mgconso .
    ?mgconso
    dct:source mo:MONDO ;
    rdfs:seeAlso ?mondo.
    BIND (CONCAT("http://ncbi.nlm.nih.gov/medgen/",?medgen)AS ?medgen_id)
    BIND (IRI(?medgen_id)AS ?medgen_cid)
  }
}
 ```
 ## `medgen`
 ```javascript
({nando2mondo2medgen}) => {
  return nando2mondo2medgen.results.bindings.map(b => b.medgen_cid.value);
}

```
## Endpoint
https://grch38.togovar.org/sparql

## `medgen2clinvar2togovar`
```sparql
PREFIX cvo:    <http://purl.jp/bio/10/clinvar/>
PREFIX dct:    <http://purl.org/dc/terms/>
PREFIX medgen: <http://ncbi.nlm.nih.gov/medgen/>
PREFIX rdfs:   <http://www.w3.org/2000/01/rdf-schema#>
PREFIX sio:    <http://semanticscience.org/resource/>
PREFIX tgvo:   <http://togovar.biosciencedbc.jp/vocabulary/>

SELECT DISTINCT ?variation_id ?tgv_id ?rs_id ?variant ?title ?condition ?clinvar ?vcv ?type ?med_id ?interpretation
WHERE {
  VALUES ?med_id { {{#each medgen}} <{{this}}> {{/each}} } 

  GRAPH <http://togovar.org/clinvar> {
    ?med_id ^dct:references ?_classified_condition .

    ?_classified_condition ^cvo:classified_condition/^cvo:classified_condition_list ?_rcv ;
      rdfs:label ?condition .

    ?_rcv cvo:rcv_classifications/cvo:germline_classification/cvo:description/cvo:description ?interpretation ;
      cvo:rcv_classifications/cvo:germline_classification/cvo:description/cvo:date_last_evaluated ?last_evaluated ;
      ^cvo:rcv_accession/^cvo:rcv_list/^cvo:classified_record ?clinvar .

    ?clinvar a cvo:VariationArchiveType ;
      rdfs:label ?title ;
      cvo:accession ?vcv ;
      cvo:variation_id ?vid .
     # cvo:interpreted_record/cvo:review_status ?review_status ;
     # cvo:interpreted_record/sio:SIO_000628/dct:references ?dbsnp .

    BIND(STR(?vid) AS ?variation_id)

    # ?dbsnp rdfs:seeAlso ?rs_id ;
    #  dct:source ?dbname .
    # FILTER(?dbname IN ("dbSNP"))
  }

  OPTIONAL{ 
    GRAPH <http://togovar.org/variant> {
      ?variant dct:identifier ?variation_id .
      FILTER REGEX(?variation_id, "^[0-9]+$")

      ?variant dct:identifier ?tgv_id ;
               rdf:type ?type.
      FILTER(!REGEX(?tgv_id, "^[0-9]+$")).  # tgv_id like 'tgv0001' or '1-1234-A-C'
    }
  }
}
                    
```
## result
```javascript
({medgen2clinvar2togovar, nando2mondo2medgen}) => {
    const medgen2mondo = {};
    nando2mondo2medgen.results.bindings.forEach(x => {
        medgen2mondo[x.medgen_id.value] = x.mondo.value;
    });

    return medgen2clinvar2togovar.results.bindings.map(x => {
        const positionMatch = x.variant && x.variant.value 
            ? x.variant.value.match(/http:\/\/identifiers.org\/hco\/(.+)\/GRCh3[78]#(\d+)/) 
            : null;
        const position = positionMatch ? positionMatch[1] + ":" + positionMatch[2] : "";

        // tgv_id と tgv_link の存在確認
        const tgv_id = x.tgv_id && x.tgv_id.value ? x.tgv_id.value : "";
        const tgv_link = tgv_id ? "https://grch38.togovar.org/variant/" + tgv_id : "";

        return {
            tgv_id: tgv_id,
            tgv_link: tgv_link,
            position: position,
            title: x.title && x.title.value ? x.title.value : "",
            Clinvar_link: x.clinvar && x.clinvar.value ? x.clinvar.value : "",
            Clinvar_id: x.vcv && x.vcv.value ? x.vcv.value : "",
            Interpretation: x.interpretation && x.interpretation.value ? x.interpretation.value : "",
            type: x.type && x.type.value ? x.type.value.replace("http://genome-variation.org/resource#", "") : "",
            MedGen_id: x.med_id && x.med_id.value ? x.med_id.value.replace("http://ncbi.nlm.nih.gov/medgen/", "") : "",
            MedGen_link: x.med_id && x.med_id.value ? x.med_id.value : "",
            mondo: x.med_id && medgen2mondo[x.med_id.value] ? medgen2mondo[x.med_id.value] : "",
            mondo_id: x.med_id && medgen2mondo[x.med_id.value] 
                ? medgen2mondo[x.med_id.value].replace("http://purl.obolibrary.org/obo/MONDO_", "MONDO:") 
                : ""
        };
    });
}
```
## Description
- TogoVar 2026.1 リリースに伴う修正 2026/10/7 三橋
- MedGenのRDFの形式が変わったことによる変更 2024/12/05
- NANDO改変に伴う変更　2024/11/22
- APIの名前の変更（2024/06/27)
- NanbyoDataでヴァリアントの情報を表示させるために利用しているSPARQListです。
- Togovarのエンドポイントを利用しています。
- SPARQListの大元はTogovarから頂いています。
- NANDOからMONDO,MONDOからMedGenのIDに変更して、Clinvarのデータを取得しています。
- 編集：高月（2024/01/12)
