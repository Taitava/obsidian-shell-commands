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

import SC_Plugin from "../main";
import {debugLog} from "../Debug";
import {
    CustomVariableModel,
    introduceModelClass,
    PromptFieldModel,
    PromptModel,
} from "../imports";
import {OutputWrapperModel} from "./output_wrapper/OutputWrapperModel";
import {CustomShellModel} from "./custom_shell/CustomShellModel";

export function introduceModels(plugin: SC_Plugin) {
    debugLog("Introducing models.");

    // Keep in alphabetical order, if possible.
    introduceModelClass(new CustomShellModel(plugin));
    introduceModelClass(new CustomVariableModel(plugin));
    introduceModelClass(new PromptFieldModel(plugin));
    introduceModelClass(new PromptModel(plugin));
    introduceModelClass(new OutputWrapperModel(plugin));
}
