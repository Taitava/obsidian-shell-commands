/*
 * 'Shell commands' plugin for Obsidian.
 * Copyright (C) 2021 - 2025 Jarkko Linnanvirta
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, version 3.0 of the License.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 * Contact the author (Jarkko Linnanvirta): https://github.com/Taitava/
 */

import {EventVariable} from "./EventVariable";
import {extractFileName} from "../../Common";
import {SC_Event_FileRenamed} from "../../events/SC_Event_FileRenamed";
import {Shell} from "../../shells/Shell";

export class Variable_EventOldFileName extends EventVariable {
    public variable_name = "event_old_file_name";
    public help_text = "Gives the renamed file's old name with a file extension. If you need it without the extension, use {{event_old_title}} instead.";

    protected supported_sc_events = [
        SC_Event_FileRenamed,
    ];

    protected async generateValue(
        shell: Shell,
        argumentsAreNotUsed: never,
        sc_event: SC_Event_FileRenamed,
    ): Promise<string> {
        this.requireCorrectEvent(sc_event);

        return extractFileName(sc_event.getFileOldRelativePath(), true);
    }
}