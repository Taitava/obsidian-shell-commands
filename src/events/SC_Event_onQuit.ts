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

import {SC_WorkspaceEvent} from "./SC_WorkspaceEvent";
import {
    EventCategory,
    EventType,
} from "./SC_Event";

export class SC_Event_onQuit extends SC_WorkspaceEvent {
    protected static readonly event_code = "on-quit";
    protected static readonly event_title = "Obsidian quits";
    protected readonly workspace_event = "quit";
    
    public getType(): EventType {
        // TODO: Change all event_code properties to be the same as event types, and then make the parent method SC_Event.getType() return event_code. Then all sub-methods of getType() can be removed.
        return "application-quit";
    }
    
    public getCategory(): EventCategory {
        return "application";
    }
}