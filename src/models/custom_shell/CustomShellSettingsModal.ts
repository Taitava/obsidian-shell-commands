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

import {SC_Modal} from "../../SC_Modal";
import SC_Plugin from "../../main";
import {
    Setting,
    TextAreaComponent,
} from "obsidian";
import {CustomShellInstance} from "./CustomShellInstance";
import {
    PlatformId,
    PlatformNames,
    PlatformNamesMap,
} from "../../settings/SC_MainSettings";
import {
    lookUpFileWithBinaryExtensionsOnWindows,
    createMultilineTextElement,
    getCurrentPlatformName,
    getOperatingSystem,
    getPlatformName,
    gotoURL,
} from "../../Common";
import {CreateShellCommandFieldCore} from "../../settings/setting_elements/CreateShellCommandFieldCore";
import {ShellCommandExecutor} from "../../ShellCommandExecutor";
import {
    getUsedVariables,
    parseVariables,
    ParsingResult,
} from "../../variables/parseVariables";
import {CustomShell} from "../../shells/CustomShell";
import {
    CustomShellConfiguration,
    CustomShellModel,
} from "./CustomShellModel";
import {IRawArguments} from "../../variables/Variable";
import {Variable_VaultPath} from "../../variables/Variable_VaultPath";
import {Variable_FolderPath} from "../../variables/Variable_FolderPath";
import {Variable_FilePath} from "../../variables/Variable_FilePath";
import {createAutocomplete} from "../../settings/setting_elements/Autocomplete";
import {Variable_ShellCommandContent} from "../../variables/Variable_ShellCommandContent";
import {SettingFieldGroup} from "../../settings/SC_MainSettingsTab";
import * as path from "path";
import * as fs from "fs";
import {getPATHEnvironmentVariableName} from "../../settings/setting_elements/PathEnvironmentVariableFunctions";
import {TShellCommand} from "../../TShellCommand";
import {Documentation} from "../../Documentation";

export class CustomShellSettingsModal extends SC_Modal {

    private approved = false;

    constructor(
        plugin: SC_Plugin,
        private readonly customShellInstance: CustomShellInstance,

        /** Can be undefined if the instance is created from a place where there is no name element. */
        private readonly nameSetting?: Setting,

        /** If defined, a button will be added and onAfterApproval() / onAfterCancelling() will be called depending on whether the button was clicked or not. */
        private readonly okButtonText?: string,
        private readonly onAfterApproval?: () => void,
        private readonly onAfterCancelling?: () => void,
    ) {
        super(plugin);
    }

    public onOpen(): void {
        super.onOpen();
        const containerElement = this.modalEl;
        const titleAndDescriptionGroupElement = containerElement.createDiv({attr: {class: "SC-setting-group"}});

        // Name
        const title_setting = new Setting(titleAndDescriptionGroupElement)
            .setName("Shell name")
            .setDesc("A label used to select the shell in settings.")
            .addText(text => text
                .setValue(this.getCustomShellConfiguration().name)
                .onChange(async (newName: string) => {
                    this.getCustomShellConfiguration().name = newName;
                    await this.plugin.saveSettings();

                    // Update the title in a name setting. (Only if the modal was created from a place where a CustomShellInstance name element exists).
                    this.nameSetting?.setName(newName);
                })
            )
        ;
        const nameInputElement: HTMLInputElement = title_setting.controlEl.find("input") as HTMLInputElement;

        // Focus on the name field.
        nameInputElement.focus();

        // Description
        new Setting(titleAndDescriptionGroupElement)
            .setName("Description")
            .addTextArea(textarea => textarea
                .setValue(this.getCustomShellConfiguration().description)
                .onChange(async (newDescription: string) => {
                    this.getCustomShellConfiguration().description = newDescription;
                    await this.plugin.saveSettings();

                    // Update the description in a name setting. (Only if the modal was created from a place where a CustomShellInstance name element exists).
                    if (this.nameSetting) {
                        this.nameSetting.setDesc(""); // Clear a possible old description.
                        createMultilineTextElement("span", newDescription, this.nameSetting.descEl);
                    }
                })
            )
        ;

        // Binary path.
        this.createBinaryPathSetting(containerElement.createDiv({attr: {class: "SC-setting-group"}}));

        // Shell arguments.
        this.createShellArgumentsSetting(containerElement.createDiv({attr: {class: "SC-setting-group"}}));

        // Supported operating systems
        const hostPlatformContainer = containerElement.createDiv({attr: {class: "SC-setting-group"}});
        this.createHostPlatformField(hostPlatformContainer);

        // Shell operating system
        new Setting(containerElement.createDiv({attr: {class: "SC-setting-group"}}))
            .setName("Shell's operating system")
            .setDesc("If the shell virtualizes, uses as a subsystem, or otherwise emulates another operating system than the selected host operating system, select it here. This is used to make directory paths etc. work correctly.")
            .addDropdown(dropdownComponent => dropdownComponent
                .addOption("none", "Same as 'Host platform' (" + getPlatformName(this.getCustomShellConfiguration().host_platform) + ")")
                .addOptions(PlatformNames as Record<string, string>) // FIXME: Find a better way to tell TypeScript that PlatformNames is of a correct type.
                .setValue(this.getCustomShellConfiguration().shell_platform ?? "none")
                .onChange(async (newShellPlatform: string) => {
                    switch (newShellPlatform as PlatformId | "none") {
                        case "none":
                            this.getCustomShellConfiguration().shell_platform = null;
                            break;
                        default:
                            this.getCustomShellConfiguration().shell_platform = newShellPlatform as PlatformId;
                    }
                    await this.plugin.saveSettings();
                })
            )
            .addExtraButton(button => button
                .setIcon("help")
                .setTooltip("Documentation: Shell's operating system")
                .onClick(() => gotoURL(Documentation.environments.customShells.settings + "#Shell's+operating+system"))
            )
        ;

        // Special characters escaping
        new Setting(containerElement.createDiv({attr: {class: "SC-setting-group"}}))
            .setName("Special characters escaping")
            .setDesc("Used to quote special characters (= other than alphabets, numbers and _) in {{variable}} values.")
            .addDropdown(dropdownComponent => dropdownComponent
                .addOptions({
                    "UnixShell": "Unix shell style with \\ as escape character",
                    "PowerShell": "PowerShell style with ` as escape character",
                    "none": "No escaping (not recommended)",
                })
                .setValue(this.getCustomShellConfiguration().escaper ?? "none")
                .onChange(async (newEscaper: "UnixShell" | "PowerShell" | "none") => {
                    this.getCustomShellConfiguration().escaper = newEscaper === "none" ? null : newEscaper;
                    await this.plugin.saveSettings();
                })
            )
            .addExtraButton(button => button
                .setIcon("help")
                .setTooltip("Documentation: Special characters escaping")
                .onClick(() => gotoURL(Documentation.environments.customShells.settings + "#Special+characters+escaping"))
            )
        ;

        // Path translator.
        const pathTranslatorContainer = containerElement.createDiv({attr: {class: "SC-setting-group"}});
        this.createPathTranslatorField(pathTranslatorContainer);

        // Shell command wrapper.
        this.createShellCommandWrapperField(containerElement);

        // Shell testing field.
        this.createShellTestField(containerElement);
    }

    private createBinaryPathSetting(containerElement: HTMLElement): void {
        new Setting(containerElement)
            .setName("Executable binary file path")
            .setDesc("This should only contain a directory and a file name (or just a file name), not any possible command line options/arguments. They will be configured below.")
            .addText(textComponent => textComponent
                .setValue(this.getCustomShellConfiguration().binary_path)
                .onChange(async (newBinaryPath: string) => {
                    this.getCustomShellConfiguration().binary_path = newBinaryPath;
                    await this.plugin.saveSettings();
                    updateBinaryPathWarning();
                }),
            )
            .addExtraButton(button => button
                .setIcon("help")
                .setTooltip("Documentation: Executable binary file path")
                .onClick(() => gotoURL(Documentation.environments.customShells.settings + "#Executable+binary+file+path"))
            )
        ;
        const binaryPathWarningDescription = new Setting(containerElement)
            .setClass("SC-full-description")
        ;
        const updateBinaryPathWarning = () => {
            const binaryPath = this.getCustomShellConfiguration().binary_path;
            if ("" === binaryPath) {
                // No binary path.
                binaryPathWarningDescription.setDesc("Note: No binary path is defined.");
                binaryPathWarningDescription.descEl.addClass("SC-text-right"); // Short texts should be aligned to the right, so that they are under the binary path input field.
            } else {
                // A binary path is defined.
                const actualBinaryPathExists = fs.existsSync(binaryPath);
                const appendedBinaryPathExists = !actualBinaryPathExists && lookUpFileWithBinaryExtensionsOnWindows(binaryPath); // No need to do lookup if actualBinaryPathExists.
                if (actualBinaryPathExists || appendedBinaryPathExists) {
                    // The binary path exists.
                    if (actualBinaryPathExists && fs.lstatSync(binaryPath).isDirectory()) { // Don't check for a folder if the file was determined by adding an extension to the file name, because fs.lstatSync() breaks if a non-existing path is passed to it.
                        // The binary path is a folder.
                        binaryPathWarningDescription.setDesc("Note: " + binaryPath + " is a directory. A file is expected.");
                    } else {
                        // OK: A file exists.
                        binaryPathWarningDescription.setDesc("Good, " + binaryPath + " exists.");
                    }
                    binaryPathWarningDescription.descEl.addClass("SC-text-right"); // Short texts should be aligned to the right, so that they are under the binary path input field.
                } else {
                    // The binary path does not exist.
                    if (this.getCustomShellConfiguration().host_platform === getOperatingSystem()) {
                        // The shell is supposed to work on the current operating system.
                        const notExistsText = `Note: ${binaryPath} does not seem to exist.`;
                        const testShellText = " You can test the shell at the bottom of this modal.";
                        if (path.isAbsolute(binaryPath)) {
                            // The path is absolute, so it's probable that the shell won't work, as absolute binary paths are not likely to be found via the PATH environment variable.
                            binaryPathWarningDescription.setDesc(`${notExistsText} It's good that the path is absolute, but maybe it contains a typing error?${testShellText}`);
                        } else {
                            // The path is relative, so it might be executable, if it happens to be findable via the PATH environment variable.
                            binaryPathWarningDescription.setDesc(`${notExistsText} However, it might still work if the operating system recognises it as an executable command.${testShellText} If you encounter problems, try using an absolute path, i.e. a full path starting from the root of the file system.`);
                        }
                    } else {
                        // The shell is meant for another operating system, so it's understandable that the binary might not be present on this OS.
                        binaryPathWarningDescription.setDesc("Note: The shell is configured to be used on a different operating system than " + getCurrentPlatformName() + ", so the existence of the binary file cannot be reliably verified.");
                    }
                    binaryPathWarningDescription.descEl.removeClass("SC-text-right"); // Long texts should be aligned to the left.
                }
            }
        };
        updateBinaryPathWarning();
    }

    private createShellArgumentsSetting(containerElement: HTMLElement): void {
        const shellCommandContentVariable = new Variable_ShellCommandContent(this.plugin, ""); // For getting an autocomplete item.
        new Setting(containerElement)
            .setName("Shell arguments")
            .setDesc("Command line options/arguments to execute the shell's binary file with. The executable shell command should be one of them; " + shellCommandContentVariable.getFullName(true) + " provides it. Other {{variables}} are supported, too. Separate different arguments with a newline. Possible newlines coming from {{variable}} values are not considered as separators.")
            .addTextArea((textareaComponent: TextAreaComponent) => textareaComponent
                .setValue(this.getCustomShellConfiguration().shell_arguments.join("\n"))
                .onChange(async (concatenatedShellArguments) => {
                    this.getCustomShellConfiguration().shell_arguments = concatenatedShellArguments.split("\n");
                    await this.plugin.saveSettings();
                    updateNoShellCommandContentVariableWarning();
                })
                .then((textareaComponent: TextAreaComponent) => {
                    if (this.plugin.settings.show_autocomplete_menu) {
                        createAutocomplete(
                            this.plugin,
                            textareaComponent.inputEl,
                            () => textareaComponent.onChanged(),
                            shellCommandContentVariable.getAutocompleteItems(),
                        );
                    }
                })
            )
            .addExtraButton(button => button
                .setIcon("help")
                .setTooltip("Documentation: Shell arguments")
                .onClick(() => gotoURL(Documentation.environments.customShells.settings + "#Shell+arguments"))
            )
        ;
        const shellArgumentsWarningDescription = new Setting(containerElement)
            .setClass("SC-full-description")
        ;
        const updateNoShellCommandContentVariableWarning = () => {
            const shellArguments: string = this.getCustomShellConfiguration().shell_arguments.join("\n"); // Then join glue does not really matter here.
            if (0 === getUsedVariables(this.plugin, shellArguments, shellCommandContentVariable).size) {
                // The arguments do not contain {{shell_command_content}}. Show a warning.
                shellArgumentsWarningDescription.setDesc(this.getShellCommandContentWarningText("arguments", shellCommandContentVariable));
            } else {
                // Clear a possible earlier warning.
                shellArgumentsWarningDescription.setDesc("");
            }
        };
        updateNoShellCommandContentVariableWarning();
    }

    private createHostPlatformField(containerElement: HTMLElement) {

        new Setting(containerElement)
            .setName("Host operating system")
            .setDesc("The shell is only available when Obsidian runs on the selected operating system. Note that in case your shell utilizes a sub-operating system (e.g. Windows Subsystem for Linux, WSL), you still need to select the operating system Obsidian is running on, not the sub-system's operating system.")
            .addDropdown(dropdownComponent => dropdownComponent
                .addOptions(Object.fromEntries(PlatformNamesMap))
                .setValue(this.getCustomShellConfiguration().host_platform)
                .onChange(async (newHostPlatform: PlatformId) => {
                    const changeResult: true | string = this.customShellInstance.changeHostPlatformIfCan(newHostPlatform);
                    if ("string" === typeof changeResult) {
                        // Cannot change the host platform, because the shell has usages.
                        this.plugin.newError("Cannot change the host platform, because the shell is used " + changeResult + ".");
                        dropdownComponent.setValue(this.getCustomShellConfiguration().host_platform); // Undo changing dropdown selection.
                    } else {
                        // The host platform was changed ok.
                        await this.plugin.saveSettings();
                    }

                    // Show or hide any platform specific settings.
                    updatePlatformSpecificSettingsVisibility(newHostPlatform);
                }),
            )
            .addExtraButton(button => button
                .setIcon("help")
                .setTooltip("Documentation: Host operating system")
                .onClick(() => gotoURL(Documentation.environments.customShells.settings + "#Host+operating+system"))
            )
            // TODO: Add an icon button for opening up a list of shell commands that allows assigning this shell for the particular shell command on the selected platform.
        ;

        // Platform specific settings.
        const windowsSpecificSettings = this.createHostPlatformWindowsSpecificSettings(containerElement);
        const updatePlatformSpecificSettingsVisibility = (newHostPlatform: PlatformId) => {
            // Update Windows settings visibility.
            windowsSpecificSettings.forEach((setting: Setting) => setting.settingEl.toggleClass("SC-hide", "win32" !== newHostPlatform));
        };

        // Hide the settings immediately, if needed.
        updatePlatformSpecificSettingsVisibility(this.getCustomShellConfiguration().host_platform);
    }

    private createHostPlatformWindowsSpecificSettings(containerElement: HTMLElement) {
        /* Enable this heading if Windows will have more than one setting. Then remove the texts "Windows: " and "The setting doesn't affect macOS/Linux" below.
        new Setting(containerElement)
            .setName("Windows specific")
            .setHeading()
            .setDesc("These settings are only used when your workstation uses Windows.")
        ;
        */

        // 'Quote shell arguments' setting.
        const quoteShellArgumentsInitialValue: boolean =
            this.getCustomShellConfiguration().host_platform_configurations.win32?.quote_shell_arguments // Use value from user configuration if defined.
            ?? CustomShellModel.getDefaultHostPlatformWindowsConfiguration().quote_shell_arguments // Otherwise get a default value.
        ;
        const quoteShellArgumentsSetting = new Setting(containerElement)
            .setName("Windows: Quote shell arguments")
            .setDesc('Wraps shell arguments in double quotes if they contain spaces (e.g. echo Hi becomes "echo Hi"). If arguments contain double quotes already, they are escaped by preceding them with a backslash (e.g. echo "Hi there" becomes "echo \\"Hi there\\""). If your shell complains that a command does not exist, try changing this setting. (The setting doesn\'t affect macOS/Linux. The quoting is done by Node.js, not by the SC plugin.)')
            .setClass("SC-wide-description") // .setClass() actually _adds_ a class, so this call...
            .setClass("SC-indent")           // ...is not overridden by this call.
            .addToggle(toggleComponent => toggleComponent
                .setValue(quoteShellArgumentsInitialValue)
                .onChange(async (quoteShellArgumentsNewValue: boolean) => {
                    const customShellConfiguration: CustomShellConfiguration = this.getCustomShellConfiguration();
                    if (undefined === customShellConfiguration.host_platform_configurations.win32) {
                        // If win32 is not defined, create an object for it with default values - which can be overridden immediately.
                        customShellConfiguration.host_platform_configurations.win32 = CustomShellModel.getDefaultHostPlatformWindowsConfiguration();
                    }
                    customShellConfiguration.host_platform_configurations.win32.quote_shell_arguments = quoteShellArgumentsNewValue;
                    await this.plugin.saveSettings();
                })
            )
            .addExtraButton(button => button
                .setIcon("help")
                .setTooltip("Documentation: Windows: Quote shell arguments")
                .onClick(() => gotoURL(Documentation.environments.customShells.settings + "#Windows%3A+Quote+shell+arguments"))
            )
        ;

        // Return all created settings for visibility control.
        return [
            quoteShellArgumentsSetting,
        ];
    }

    private createPathTranslatorField(containerElement: HTMLElement): void {
        new Setting(containerElement)
            .setName("Path translator")
            .setDesc("Certain {{variables}} return file system paths, which can be converted to work in this shell. Some shells introduce sub-environments where the same file is referred to using a different absolute path than in the host operating system. A custom JavaScript function can be defined to convert absolute file paths from the host operating system's format to the one expected by the target system. Note that no directory separator changes are needed to be done - they are already changed based on the 'Shell's operating system' setting. Path translation is optional.")
            .setClass("SC-path-translator-setting")
            .addTextArea(textareaComponent => textareaComponent // TODO: Make the textarea grow based on content height.
                .setValue(this.getCustomShellConfiguration().path_translator ?? "")
                .onChange(async (newPathTranslator: string) => {
                    if ("" === newPathTranslator.trim()) {
                        // Disable translator
                        this.getCustomShellConfiguration().path_translator = null;
                    } else {
                        // Enable or update translator
                        this.getCustomShellConfiguration().path_translator = newPathTranslator;
                    }
                    await this.plugin.saveSettings();
                })
            )
            .addExtraButton(button => button
                .setIcon("help")
                .setTooltip("Documentation: Path translator")
                .onClick(() => gotoURL(Documentation.environments.customShells.settings + "#Path+translator"))
            )
        ;
        const pathTranslatorTestVariables = [
            new Variable_VaultPath(this.plugin),
            new Variable_FilePath(this.plugin),
            new Variable_FolderPath(this.plugin),
        ];
        new Setting(containerElement)
            .setDesc("The JavaScript code will be enclosed in a function that receives 'absolutePath' as a parameter (the file/folder path needed to be translated). As it's always absolute, the path starts from the root of the host platform's file system (" + getCurrentPlatformName() + " file system), and the function should convert it to start from the root of the sub-environment.")
            .setClass("SC-full-description")
            .addExtraButton(button => button
                .setTooltip("Test absolute path translation")
                .setIcon("type")
                .onClick(async () => {
                    for (const variable of pathTranslatorTestVariables) {
                        let variableArguments: IRawArguments = {};
                        if (variable instanceof Variable_FilePath || variable instanceof Variable_FolderPath) {
                            variableArguments = {mode: "absolute"};
                        }
                        const variableValueResult = await variable.getValue(this.getCustomShell(), null, null, variableArguments);
                        const translatedPath = variableValueResult.succeeded ? variableValueResult.value : variableValueResult.error_messages[0];
                        this.plugin.newNotification(variable.getFullName(false, Object.values(variableArguments)) + " = " + translatedPath);
                    }
                })
            )
        ;
        new Setting(containerElement)
            .setDesc("The function SHOULD NOT CAUSE side effects! It must not alter any data outside it. Try to keep the function short and simple, as possible errors are hard to inspect. The function is never called for relative paths.")
            .setClass("SC-full-description")
        ;
        createMultilineTextElement("span", `
        Examples on how {{file_path:absolute}} could be translated:
        A) From Windows path to Linux path (WSL):
        - absolutePath: C:/Obsidian/MyVault/MyFolder/MyNote.md (note that directory separators \\ are already converted to / before the function is called).
        - Expected return: /mnt/c/Obsidian/MyVault/MyFolder/MyNote.md
        B) From Windows path to Linux path (MinGW-w64):
        - absolutePath: C:/Obsidian/MyVault/MyFolder/MyNote.md (same note as above).
        - Expected return: /c/Obsidian/MyVault/MyFolder/MyNote.md
        `.trim(), new Setting(containerElement).setClass("SC-full-description").descEl);
    }

    private createShellCommandWrapperField(containerElement: HTMLElement) {
        // Test the shell.
        const shellCommandContentVariable = new Variable_ShellCommandContent(this.plugin, ""); // Does not need a real value.
        const wrapperSettingsContainer: HTMLElement = containerElement.createDiv({attr: {class: "SC-setting-group"}});
        new Setting(wrapperSettingsContainer)
            .setName("Wrapper for shell command")
            .setDesc(`Define optional preparing and/or finishing shell commands before/after an actual shell command. Can be used e.g. for adding directories to the ${getPATHEnvironmentVariableName()} environment variable, or setting character encodings. {{variables}} are supported. ${shellCommandContentVariable.getFullName(true)} must be included to denote a place for the main shell command. Can be left empty if no additional commands are needed.`)
            .setClass("SC-full-description")
            .addExtraButton(button => button
                .setIcon("help")
                .setTooltip("Documentation: Wrapper for shell command")
                .onClick(() => gotoURL(Documentation.environments.customShells.settings + "#Wrapper+for+shell+command"))
            )
        ;
        const settingGroup: SettingFieldGroup = CreateShellCommandFieldCore(
            this.plugin,
            wrapperSettingsContainer,
            "",
            this.getCustomShellConfiguration().shell_command_wrapper ?? "",
            this.getCustomShell(),
            null, // No need to pass a TShellCommand. It would only be used for accessing variable default values in a preview text.
            this.plugin.settings.show_autocomplete_menu,
            async (newShellCommandWrapper: string) => {
                this.getCustomShellConfiguration().shell_command_wrapper = (newShellCommandWrapper === "") ? null : newShellCommandWrapper;
                await this.plugin.saveSettings();
                updateNoShellCommandContentVariableWarning();
            },
            undefined,
            shellCommandContentVariable.getFullName(true), // Indicate that if no wrapper is defined, the shell command content is executed as-is, without additions.
            shellCommandContentVariable.getAutocompleteItems(),
        );
        settingGroup.shell_command_setting.setClass("SC-no-description");
        settingGroup.preview_setting.setClass("SC-full-description");
        new Setting(wrapperSettingsContainer)
            .setDesc(`Use ! in ${shellCommandContentVariable.getFullName(true)} to disable escaping special characters in the shell command content. Variables used in the actual shell command are already escaped if needed, so this avoids double escaping. However, you can use the ${shellCommandContentVariable.getFullName(false)} form, if you want to e.g. store shell command content in a log file. Example: echo ${shellCommandContentVariable.getFullName(false)} >> executedShellCommands.log`)
            .setClass("SC-full-description")
        ;

        const updateNoShellCommandContentVariableWarning = () => {
            const shellCommandWrapper: string | null = this.getCustomShellConfiguration().shell_command_wrapper;
            if (null !== shellCommandWrapper && 0 === getUsedVariables(this.plugin, shellCommandWrapper, shellCommandContentVariable).size) {
                // The wrapper does not contain {{shell_command_content}}. Show a warning.
                settingGroup.preview_setting.setDesc(this.getShellCommandContentWarningText("wrapper", shellCommandContentVariable));
            }
            // Don't clear the warning by setting the preview description to "", because it might actually contain parsed
            // variables. Let just CreateShellCommandFieldCore() remove the warning when it sets its preview text to the
            // description element.
        };
        updateNoShellCommandContentVariableWarning();
    }

    private createShellTestField(containerElement: HTMLElement) {
        // Test the shell.
        containerElement.createEl("hr"); // Separate non-savable form fields visually from savable settings fields.
        const testSettingsContainer: HTMLElement = containerElement.createDiv({attr: {class: "SC-setting-group"}});
        new Setting(testSettingsContainer)
            .setName("Execute a command to test the shell")
            .setDesc("This command is only executed from this settings modal. {{variables}} are supported. Output appears in a notification balloon. When playing around, keep in mind that the command is really executed, so avoid using possibly dangerous commands.")
            .setClass("SC-full-description")
            .addExtraButton(button => button
                .setTooltip("Execute the test command using this shell.")
                .setIcon("run-command")
                .onClick(async () => {
                    const customShellConfiguration: CustomShellConfiguration = this.getCustomShellConfiguration();
                    if (!this.getCustomShell().getSupportedHostPlatforms().includes(getOperatingSystem())) {
                        // Unsupported platform.
                        this.plugin.newError("This shell is not defined to support " + getCurrentPlatformName() + ".");
                        return;
                    }
                    if (null === customShellConfiguration.shell_command_test) {
                        this.plugin.newError("The test shell command is empty.");
                        return;
                    }
                    const wrappedShellCommandContent: string = customShellConfiguration.shell_command_wrapper
                        ? TShellCommand.wrapShellCommandContent(
                            this.plugin,
                            customShellConfiguration.shell_command_test,
                            customShellConfiguration.shell_command_wrapper,
                            this.getCustomShell(),
                        )
                        : customShellConfiguration.shell_command_test // No wrapper, use unwrapped shell command content.
                    ;
                    const testShellCommandParsingResult: ParsingResult = await parseVariables(
                        this.plugin,
                        wrappedShellCommandContent,
                        this.getCustomShell(),
                        true, // Enable escaping, but if this.customShellInstance.configuration.escaper is "none", then escaping is prevented anyway.
                        null, // No TShellCommand, so no access for default values.
                        null, // This execution is not launched by an event.
                    );
                    if (testShellCommandParsingResult.succeeded) {
                        // Can execute.
                        const childProcess = await this.getCustomShell().spawnChildProcess(
                            testShellCommandParsingResult.parsed_content as string,
                            ShellCommandExecutor.getWorkingDirectory(this.plugin),
                            null, // No TShellCommand is available during testing.
                            null, // Testing is not triggered by any SC_Event.
                        );
                        if (null === childProcess) {
                            // No spawn() call was made due to some shell configuration error. Just cancel everything.
                            return;
                        }
                        childProcess.on("error", (error: Error) => {
                            // Probably most errors will NOT end up here, I guess this event occurs for some rare errors.
                            this.plugin.newError("Shell test failed to execute. Error: " + error.message);
                        });
                        childProcess.on("exit", (exitCode: number | null) => {
                            // exitCode is null if user terminated the process. Reference: https://nodejs.org/api/child_process.html#event-exit (read on 2022-11-27).
    
                            // Show outputs.
                            let notified = false;
                            if (null === childProcess.stdout || null == childProcess.stderr) {
                                throw new Error("Child process's stdout and/or stderr stream is null.");
                            }
                            childProcess.stdout.setEncoding("utf8"); // Receive stdout and ...
                            childProcess.stderr.setEncoding("utf8"); // ... stderr as strings, not as Buffer objects.
                            const stdout: string = childProcess.stdout.read();
                            const stderr: string = childProcess.stderr.read();
                            if (stdout) {
                                this.plugin.newNotification(stdout);
                                notified = true;
                            }
                            if (stderr) {
                                this.plugin.newError("[" + exitCode + "]: " + stderr);
                                notified = true;
                            }
                            if (!notified) {
                                this.plugin.newNotification("Shell test finished. No output was received.");
                            }
                        });
                    } else {
                        // Some variable has failed.
                        this.plugin.newErrors(testShellCommandParsingResult.error_messages);
                    }
                }),
            )
            .addExtraButton(button => button
                .setIcon("help")
                .setTooltip("Documentation: Execute a command to test the shell")
                .onClick(() => gotoURL(Documentation.environments.customShells.settings + "#Execute+a+command+to+test+the+shell"))
            )
        ;
        CreateShellCommandFieldCore(
            this.plugin,
            testSettingsContainer,
            "",
            this.getCustomShellConfiguration().shell_command_test ?? "",
            this.getCustomShell(),
            null, // No need to pass a TShellCommand. It would only be used for accessing variable default values in a preview text.
            this.plugin.settings.show_autocomplete_menu,
            async (newTestShellCommandContent: string) => {
                this.getCustomShellConfiguration().shell_command_test = (newTestShellCommandContent === "") ? null : newTestShellCommandContent;
                await this.plugin.saveSettings();
            },
            undefined,
            "Enter a temporary shell command for testing."
        ).shell_command_setting.setClass("SC-no-description");
    }

    private getCustomShell(): CustomShell {
        return this.customShellInstance.getCustomShell();
    }

    private getCustomShellConfiguration(): CustomShellConfiguration {
        return this.customShellInstance.configuration;
    }

    private getShellCommandContentWarningText(subject: string, shellCommandContentVariable: Variable_ShellCommandContent): string {
        return "Warning! The " + subject + " should contain " + shellCommandContentVariable.getFullName(true) + ". Otherwise, the shell will be called without the actual shell command that was supposed to be executed.";
    }

    protected approve(): void {
        if (this.onAfterApproval) {
            this.approved = true;
            this.onAfterApproval();
        }
        this.close();
    }

    public onClose(): void {
        super.onClose();

        // Call a cancelling hook if one is defined (and if the closing happens due to cancelling, i.e. the ok button is NOT clicked).
        if (!this.approved && this.onAfterCancelling) {
            this.onAfterCancelling();
        }
    }
}