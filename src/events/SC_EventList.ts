import ShellCommandsPlugin from "../main";
import {SC_Event_onLayoutReady} from "./SC_Event_onLayoutReady";

export function getSC_Events(plugin: ShellCommandsPlugin) {
    if (undefined === getSC_Events.events) {
        // Cache the list of SC_Event objects
        getSC_Events.events = [
            new SC_Event_onLayoutReady(plugin),
        ];
    }
    return getSC_Events.events;
}
getSC_Events.events = undefined;