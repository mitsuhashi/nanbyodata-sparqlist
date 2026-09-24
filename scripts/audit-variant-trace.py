"""Independently check the output counts against a saved live-verification trace."""
import json
import math
import re
import sys
from collections import Counter


def audit(path):
    trace = json.load(open(path))
    target = trace['input']['target']
    rows = trace['Output']
    bindings = trace['medgen2clinvar2togovar' if target == 'clinvar' else 'nando2mondo2mgend']['results']['bindings']
    locations = trace['clinvar_togovar' if target == 'clinvar' else 'togovar']
    assert len(rows) == len(bindings)
    stats = Counter(rows=len(rows), queried_locations=len(locations))
    examples = {}
    matched_ids = set()
    for row, binding in zip(rows, bindings):
        key = row['position'] if target == 'clinvar' else row['ch'] + ':' + row['position']
        candidates = locations.get(key, [])
        if target == 'clinvar':
            source_id = binding.get('tgv_id', {}).get('value', '')
            matched = [v for v in candidates if v.get('id') == source_id and source_id]
            if matched:
                stats['id_matched_rows'] += 1
            else:
                genomic = re.fullmatch(r'https?://identifiers\.org/hco/([^/]+)/GRCh38#(\d+)-([ACGT]+)-([ACGT]+)', binding['variant']['value'])
                if genomic:
                    chrom, pos, ref, alt = genomic.groups()
                    matched = [v for v in candidates if (str(v['chromosome']), v['position'], v['reference'], v['alternate']) == (chrom, int(pos), ref, alt)]
                if len(matched) > 1:
                    stats['ambiguous_genomic_rows'] += 1
                    matched = []
                if matched:
                    stats['genomic_fallback_rows'] += 1
        else:
            genomic = re.search(r'/GRCh38_chr([^_]+)_(\d+)_(\d+)_([ACGT]+)_([ACGT]+)$', binding['variantID']['value'])
            at_position = [v for v in candidates if str(v['chromosome']) == row['ch'] and v['position'] == int(row['position'])]
            if genomic and len(genomic[4]) == len(genomic[5]):
                matched = [v for v in at_position if (v['reference'], v['alternate']) == (genomic[4], genomic[5])]
            else:
                matched = [v for v in at_position if any(t.get('hgvs_c') == binding['hgvs']['value'] for t in v.get('transcripts', []))]
        assert len(matched) <= 1
        variant = matched[0] if matched else None
        stats['matched_rows' if variant else 'unmatched_rows'] += 1
        if variant and variant.get('id'): matched_ids.add(variant['id'])
        if target == 'clinvar' and variant:
            # Independent cross-check of ID matching against the genomic URI.
            genomic = re.search(r'/hco/([^/]+)/GRCh38#(\d+)-([ACGT]+)-([ACGT]+)$', binding['variant']['value'])
            if genomic:
                chrom, pos, ref, alt = genomic.groups()
                assert (str(variant['chromosome']), variant['position'], variant['reference'], variant['alternate']) == (chrom, int(pos), ref, alt)
                stats['genomic_identity_checked_rows'] += 1
        if target == 'mgend' and variant:
            genomic = re.search(r'/GRCh38_chr([^_]+)_(\d+)_(\d+)_([ACGT]+)_([ACGT]+)$', binding['variantID']['value'])
            if genomic and len(genomic[4]) == len(genomic[5]):
                assert (str(variant['chromosome']), variant['position'], variant['reference'], variant['alternate']) == (genomic[1], int(genomic[2]), genomic[4], genomic[5])
                stats['genomic_identity_checked_rows'] += 1
            else:
                assert any(t.get('hgvs_c') == binding['hgvs']['value'] for t in variant.get('transcripts', []))
            hgvs = re.search(r'([ACGT]+)>([ACGT]+)$', binding['hgvs']['value'])
            if hgvs and (hgvs[1], hgvs[2]) != (variant['reference'], variant['alternate']):
                stats['transcript_genomic_alleles_differ_rows'] += 1
                examples.setdefault('transcript_genomic_alleles_differ', {'tgv_id': variant.get('id', ''), 'hgvs': binding['hgvs']['value'], 'reference': variant['reference'], 'alternate': variant['alternate']})
        raw = variant.get('frequencies', []) if variant else []
        counts = {}
        for output, nested, flat in [('genotype_count_alt_alt', 'alt_homo_count', 'aac'), ('genotype_count_alt_ref', 'hetero_count', 'arc')]:
            values = []
            for record in raw:
                value = (record.get('genotype') or {}).get(nested)
                if value is None:
                    value = record.get(flat)
                if type(value) in (int, float) and math.isfinite(value):
                    values.append(value)
            expected = sum(values) if values else 'No Data'
            assert row[output] == expected, (row['tgv_id'], output, row[output], expected)
            counts[output] = expected
        category = 'positive' if any(isinstance(x, (int, float)) and x > 0 for x in counts.values()) else 'zero' if 0 in counts.values() else 'no_data'
        stats[category + '_rows'] += 1
        if variant:
            examples.setdefault(category, {'tgv_id': variant.get('id', ''), 'position': key, 'counts': counts, 'frequencies': raw})
    stats['distinct_matched_tgv_ids'] = len(matched_ids)
    return {'input': trace['input'], 'statistics': dict(stats), 'examples': examples}


if __name__ == '__main__':
    print(json.dumps([audit(path) for path in sys.argv[1:]], ensure_ascii=False, indent=2))
