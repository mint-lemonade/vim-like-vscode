import * as vscode from 'vscode';
import { VimState } from "./mode";

export const REGISTERS = {
    DEFAULT_REG: "\"",
    CLIPBOARD_REG: "*",
    BLACKHOLE_REG: "_",
    YANK_REG: "0",
};

type RegisterEntry = { text: string[], linewise?: boolean };
const RegisterPersistenceKey = "vim-registers";
const HistoryPersistencekey = "vim-history-registers";

export class Register {
    HISTORY_REG = /[1-9]/;
    vscodeContext: vscode.ExtensionContext;

    currentDefaultReg: string = REGISTERS.DEFAULT_REG;
    selectedReg: string;

    registers: Record<string, RegisterEntry> = {};
    history: RegisterEntry[] = [];

    constructor(defaultReg: string | undefined, context: vscode.ExtensionContext) {
        if (defaultReg) {
            this.currentDefaultReg = defaultReg;
        }
        this.selectedReg = this.currentDefaultReg;

        this.registers = context.workspaceState
            .get<Record<string, RegisterEntry>>(RegisterPersistenceKey, {});
        this.history = context.workspaceState
            .get<RegisterEntry[]>(HistoryPersistencekey, []);

        context.subscriptions.push(
            vscode.commands.registerCommand("vim.registers", this.showRegisters, this)
        );
        this.vscodeContext = context;
    }

    set(reg: string) {
        if (reg.length !== 1) {
            throw new Error(`Trying to set Invalid register ${reg}`);
        }
        this.selectedReg = reg;
        VimState.keyHandler.waitingForInput = true;
    }

    reset() {
        this.selectedReg = this.currentDefaultReg;
    }

    read(): RegisterEntry {
        if (this.HISTORY_REG.test(this.selectedReg)) {
            return this.history[parseInt(this.selectedReg) - 1];
        }
        return this.registers[this.selectedReg];
    }

    write(text: string[], type: 'yank' | 'delete' | 'cut', linewise?: boolean) {
        let regEntry: RegisterEntry = {
            text,
            linewise
        };
        if (type === 'delete') {
            if (this.selectedReg === REGISTERS.DEFAULT_REG) {
                // push to history only if text at atleast one cursor is more then 1 line
                if (text.some(entry => entry.split("\n").length > 1)) {
                    this.history.unshift(regEntry);
                    if (this.history.length >= 10) { this.history.pop(); }
                }
            } else {
                if (this.HISTORY_REG.test(this.selectedReg)) {
                    this.history[parseInt(this.selectedReg) - 1] = regEntry;
                } else {
                    this.registers[this.selectedReg] = regEntry;
                }
            }
        } else {
            if (this.selectedReg === REGISTERS.DEFAULT_REG) {
                this.registers[REGISTERS.DEFAULT_REG] = regEntry;
                if (type === 'yank') {
                    this.registers[REGISTERS.YANK_REG] = regEntry;
                }
                this.history.unshift(regEntry);
                if (this.history.length >= 10) { this.history.pop(); }
            } else {
                this.registers[this.selectedReg] = regEntry;
            }
        }
        this.vscodeContext.workspaceState.update(RegisterPersistenceKey, this.registers);
        this.vscodeContext.workspaceState.update(HistoryPersistencekey, this.history);
    }

    showRegisters() {
        let items: vscode.QuickPickItem[] = [
            {
                label: "\"\"",
                description: this.registers[REGISTERS.DEFAULT_REG]?.text.join(" ")
                // description: this.registers[REGISTERS.DEFAULT_REG]?.reduce((prev, cur, i) => prev + `${i}. ${cur} `, ""),
            },
            {
                label: "History",
                kind: vscode.QuickPickItemKind.Separator,
            }
        ];

        this.history.forEach((h, i) => {
            items.push({
                label: `"${i + 1}`,
                description: h.text.join(" ")
                // description: h.reduce((prev, cur, i) => prev + `${i}. ${cur} `, "")
            });
        });

        items.push({
            label: `"${REGISTERS.YANK_REG}`,
            description: this.registers[REGISTERS.YANK_REG]?.text.join(" ") || ""
        }, {
            label: "Named",
            kind: vscode.QuickPickItemKind.Separator
        });

        Object.entries(this.registers).forEach(([name, entry]) => {
            if (name !== REGISTERS.DEFAULT_REG && name !== REGISTERS.YANK_REG) {
                items.push({
                    label: `"${name}`,
                    description: entry.text.join(" ")
                    // description: text.reduce((prev, cur, i) => prev + `${i}. ${cur} `, "")
                });
            }
        });
        vscode.window.showQuickPick(items);
    }
}