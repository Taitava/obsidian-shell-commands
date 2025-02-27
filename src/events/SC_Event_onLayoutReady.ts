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

import {
    EventCategory,
    EventType,
    SC_Event,
} from "./SC_Event";
import {TShellCommand} from "../TShellCommand";

export class SC_Event_onLayoutReady extends SC_Event {
    protected static readonly event_code = "on-layout-ready";
    protected static readonly event_title = "Obsidian starts";
    protected register_after_changing_settings = false;

    protected _register(t_shell_command: TShellCommand) {
        this.app.workspace.onLayoutReady(async () => await this.trigger(t_shell_command));
        return false; // The base class does not need to register anything.
    }

    protected _unregister(t_shell_command: TShellCommand): void {
        // No need to unregister, because this event happens only once when Obsidian starts. If the event is not enabled for a shell command, next time Obsidian starts, this event won't get registered.
    }
    
    public getType(): EventType {
        // TODO: Change all event_code properties to be the same as event types, and then make the parent method SC_Event.getType() return event_code. Then all sub-methods of getType() can be removed.
        return "application-started";
    }
    
    public getCategory(): EventCategory {
        return "application";
    }
}