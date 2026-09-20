# KSK2 field mappings

This directory holds **data-driven** procedure→XSD maps extracted from official
packs (`e-tax10` 法人税, `e-tax11` 消費税, …).

OpenOrgOS must not invent element names or wrap payload fields in a guessed
form root. Until a YAML file **and** an official envelope binding exist,
`orgos etax build` stays `SPEC_BLOCKED` even if XSD files are unpacked.

Do not commit NTA field dumps copied from Excel without an explicit OpenOrgOS
procedure row (`EXPERIMENTAL` / `SUPPORTED`).
