import ELFFile, { CompileUnit, Die, DWARFInfo } from "jselftools";
import { getBuildElfFileContent, getSHA256 } from "./utils";
import { Uri } from "vscode";

const registerDump = /Core\s*\d+\s+register\s+dump:/;
const pcRegExp = /(?:Saved PC:|PC\s*:\s*)?\s*(0x[0-9a-fA-F]+)/;
const ADDRESS_RE = /0x[0-9a-f]{8}/gi; // /0x[0-9a-f]{8}/i;

export class AddressDecoder {
    private static dwarfinfo: DWARFInfo;
    private static subprograms: Die[] = [];
    private static intervals: number[][] = [];
    private static panicking: boolean = false;
    private static sha: string;

    static async update(workspaceFolder: Uri) {
        var elfFileBuffer: ArrayBufferLike = await getBuildElfFileContent(workspaceFolder);
        elfFileBuffer = elfFileBuffer.slice(9);
        this.sha = await getSHA256(elfFileBuffer);
        /*
        var hexValue = Array.from(new Uint8Array(elfFileBuffer.slice(0, 20)))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        console.log(hexValue, elfFileBuffer.byteLength);
        */
        const elffile = new ELFFile(elfFileBuffer);
        this.dwarfinfo = elffile.get_dwarf_info();
        for (const CU of this.dwarfinfo.get_CUs()) {
            for (var die of CU.dies) {
                if (die.has_children) {
                    for (var child of die.children) {
                        if (child.tag === "DW_TAG_subprogram") {
                            var highPc = child.attributes["DW_AT_high_pc"];
                            var lowPc = child.attributes["DW_AT_low_pc"];
                            if (lowPc && lowPc.value > 0 && highPc.value > 0) {
                                this.subprograms.push(child);
                            }
                        }
                    }
                }
            }
        }

        for (const section of elffile.body.sections) {
            if (section.flags["execinstr"]) {
                var addr = section.addr;
                this.intervals.push([Number(addr), Number(addr) + Number(section.size)]);
            }
        }
        this.intervals.sort((a, b) => a[0]-b[0]);
    }

    static decode(address: number, outputFn: (message: string) => void): boolean {
        for (const [start, end] of this.intervals) {
            console.log("AddressDecoder", "start", start, "end", end, "address", address, "0x"+address.toString(16));
            if (start > address) {
                console.log("AddressDecoder", "address out of range", address);
                return false;
            } else if (start <= address && address < end) {
                //outputFn("address in range"); // TODO: for MTVEC in register dump that is not yet decoded 
                break;
            }
        }
        for (var subprogram of this.subprograms) {
            const lowPc = subprogram.attributes["DW_AT_low_pc"].value;
            const highPc = subprogram.attributes["DW_AT_high_pc"].value + lowPc;
            if (address >= lowPc && address < highPc) {
                console.log(subprogram.attributes["DW_AT_name"].value);
                const line = this.checkLineprogram(subprogram.cu, address);
                const hexAddress = address.toString(16);
                outputFn("0x" + hexAddress + ": " + subprogram.attributes["DW_AT_name"].value + " at " + line);
                return true;
            }
        }
        console.log("AddressDecoder", "failed not found", address);
        return false;
    }

    static parser(line: string, outputFn: (message: string) => void) {
        const parserOutput = (line: string) => {
            outputFn("\x1b[33m-- " + line + "\x1b[0m");
        };
        if (ADDRESS_RE.test(line)) {
            outputFn(line);
            const match = line.match(ADDRESS_RE) ?? [];
            const addrMap = match.map(hex => parseInt(hex, 16));
            var decoded: boolean = false;
            for (const addr of addrMap) {
                if (this.decode(addr, parserOutput)) {
                    decoded = true;
                }
            }
            if (decoded) {
                outputFn("");
            }
            return;
        }
        if (registerDump.test(line)) {
            this.panicking = true;
        } else if (line.includes("ELF file SHA256:")) {
            var hash = this.extractHash(line);
            if (hash) {
                this.panicking = false;
                outputFn(line);
                if (!this.sha.startsWith(hash)) {
                    parserOutput("Warning: Checksum mismatch between flashed and built applications. Checksum of built application is " + this.sha);
                }
                return;
            }
        }
        outputFn(line);
    }

    static extractHash(line: string): string {
        const pattern = /(?:I \(\d+\) cpu_start: )?ELF file SHA256:\s+(\w+)/;
        const match = line.match(pattern);
        return match ? match[1] : "";
    }

    static checkLineprogram(cu: CompileUnit, address: number): string {
        const lineprog = this.dwarfinfo.line_program_for_CU(cu);
        if (!lineprog) {
            return "";
        };
        const delta = lineprog.header.version < 5 ? 1 : 0;
        var prevstate = null;
        for (var entry of lineprog.get_entries()) {
            if (entry.state === null) {
                continue;
            }
            if (prevstate && (prevstate.address <= address) && (address < entry.state.address)) {
                var filename = lineprog.header.file_entry[prevstate.file - delta];
                var line = prevstate.line;
                var directory = lineprog.header.include_directory[filename.dir_index - delta];
                var location = directory + "/" + filename.name + ":" + line + ":" + prevstate.column;
                if (prevstate.discriminator > 0) {
                    location += " (discriminator " + prevstate.discriminator + ")";
                }
                return location;
            }
            if (entry.state.end_sequence) {
                prevstate = null;
            } else {
                prevstate = entry.state;
            }
        }
        return "";
    }
    /*
    https://github.com/search?q=repo%3Aespressif%2Fesp-idf-monitor+%22in+ROM%22&type=code
    https://github.com/espressif/esp-idf-monitor/blob/899b129b6b24d18f77280ed6ae7c9232eabe4da6/esp_idf_monitor/base/rom_elf_getter.py#L19
    */
}
