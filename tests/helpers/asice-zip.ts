import { crc32 } from "node:zlib";
import { writeFileSync } from "node:fs";

/** Minimal store-only ZIP writer — enough for the lite ASiC-E structural checks. */
export function buildStoreZip(members: Array<{ name: string; data: Buffer }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const member of members) {
    const name = Buffer.from(member.name, "utf-8");
    const crc = crc32(member.data) >>> 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(member.data.length, 18);
    local.writeUInt32LE(member.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, member.data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(member.data.length, 20);
    central.writeUInt32LE(member.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + member.data.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(members.length, 8);
  end.writeUInt16LE(members.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, centralBuf, end]);
}

export function writeStoreZip(
  path: string,
  members: Array<{ name: string; data: Buffer }>,
): void {
  writeFileSync(path, buildStoreZip(members));
}

/** Well-formed signed ASiC-E: mimetype + PDF + XAdES signature member. */
export function buildAsiceContainer(pdf: Buffer, pdfName = "contract.pdf"): Buffer {
  return buildStoreZip([
    { name: "mimetype", data: Buffer.from("application/vnd.etsi.asic-e+zip", "utf-8") },
    { name: pdfName, data: pdf },
    {
      name: "META-INF/signatures0.xml",
      data: Buffer.from("<XAdESSignatures/>", "utf-8"),
    },
  ]);
}
