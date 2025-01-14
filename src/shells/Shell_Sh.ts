/*
 * 'Shell commands' plugin for Obsidian.
 * Copyright (C) 2021 - 2024 Jarkko Linnanvirta
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

import {PlatformId} from "../settings/SC_MainSettings";
import {normalizePath2} from "../Common";
import {ShEscaper} from "../variables/escapers/ShEscaper";
import {BuiltinShell} from "./BuiltinShell";

export class Shell_Sh extends BuiltinShell {
    protected ownedShellBinaries = [
        "sh"
    ];

    protected getEscaper(rawValue: string): ShEscaper {
        return new ShEscaper(rawValue);
    }

    public getName(): string {
        return "Sh";
    }

    public getBinaryPath(): string {
        return "/bin/sh";
    }

    public getSupportedHostPlatforms(): PlatformId[] {
        return [
            "darwin", // macOS
            "linux",
        ];
    }

    public getPathSeparator(): ":" {
        return ":";
    }

    public translateAbsolutePath(originalPath: string): string {
        return normalizePath2(originalPath, false);
    }

    public translateRelativePath(originalPath: string): string {
        return normalizePath2(originalPath, false);
    }
}