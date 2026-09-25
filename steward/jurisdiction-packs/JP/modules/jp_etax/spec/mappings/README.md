# KSK2 field mappings

This directory holds **data-driven** procedure→XSD maps. Element local names must
come from official packs (`e-tax19` XSD and/or `e-tax10` / `e-tax11` field specs).

OpenOrgOS must not invent element names. Until a YAML file **and** an official
envelope binding exist, `orgos etax build` stays `SPEC_BLOCKED`.

## First procedure

| File | Procedure | Support |
|------|-----------|---------|
| [RHO0010.yaml](RHO0010.yaml) | 普通法人の確定申告（青色） | EXPERIMENTAL |

Do not commit NTA field dumps without an explicit OpenOrgOS procedure row
(`EXPERIMENTAL` / `SUPPORTED`).
