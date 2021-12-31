import {SC_Event_FileMenu} from "../../events/SC_Event_FileMenu";
import {SC_Event_FolderMenu} from "../../events/SC_Event_FolderMenu";
import {EventVariable} from "./EventVariable";
import {getFolderPath} from "../VariableHelpers";
import {IParameters} from "../ShellCommandVariable";
import {IAutocompleteItem} from "../../settings/setting_elements/Autocomplete";
import {addShellCommandVariableInstructions} from "../ShellCommandVariableInstructions";

export class Variable_EventFolderPath extends EventVariable {
    static variable_name = "event_folder_path";
    static help_text = "File menu: Gives path to the selected file's parent folder. Folder menu: Gives path to the selected folder. The path is either absolute from the root of the file system, or relative from the root of the Obsidian vault.";

    protected static readonly parameters: IParameters = {
        mode: {
            options: ["absolute", "relative"],
            required: true,
        },
    };

    protected arguments: {
        mode: "absolute" | "relative";
    }

    protected supported_sc_events = [
        SC_Event_FileMenu,
        SC_Event_FolderMenu,
    ];

    protected generateValue(): string | null {
        if (!this.checkSC_EventSupport()) {
            return null;
        }

        const folder = (this.sc_event as SC_Event_FileMenu | SC_Event_FolderMenu).getFolder();
        return getFolderPath(this.app, folder, this.arguments.mode);
    }

    public static getAutocompleteItems() {
        return [
            // Normal variables
            <IAutocompleteItem>{
                value: "{{" + this.variable_name + ":absolute}}",
                help_text: "File menu: Gives path to the selected file's parent folder. Folder menu: Gives path to the selected folder. The path is absolute from the root of the file system.",
                group: "Variables",
                type: "normal-variable",
            },
            <IAutocompleteItem>{
                value: "{{" + this.variable_name + ":relative}}",
                help_text: "File menu: Gives path to the selected file's parent folder. Folder menu: Gives path to the selected folder. The path is relative from the root of the Obsidian vault.",
                group: "Variables",
                type: "normal-variable",
            },

            // Unescaped variables
            <IAutocompleteItem>{
                value: "{{!" + this.variable_name + ":absolute}}",
                help_text: "File menu: Gives path to the selected file's parent folder. Folder menu: Gives path to the selected folder. The path is absolute from the root of the file system.",
                group: "Variables",
                type: "unescaped-variable",
            },
            <IAutocompleteItem>{
                value: "{{!" + this.variable_name + ":relative}}",
                help_text: "File menu: Gives path to the selected file's parent folder. Folder menu: Gives path to the selected folder. The path is relative from the root of the Obsidian vault.",
                group: "Variables",
                type: "unescaped-variable",
            },
        ];
    }
}
addShellCommandVariableInstructions(
    "{{event_folder_path:relative}} or {{event_folder_path:absolute}}",
    Variable_EventFolderPath.help_text,
);