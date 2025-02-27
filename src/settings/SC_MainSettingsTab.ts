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
    App,
    BaseComponent,
    DropdownComponent,
    PluginSettingTab,
    sanitizeHTMLToDom,
    SearchComponent,
    Setting,
} from "obsidian";
import SC_Plugin from "../main";
import {
    createCallout,
    getCurrentPlatformName,
    getObsidianInstallationType,
    getVaultAbsolutePath,
    gotoURL,
} from "../Common";
import {createShellSelectionFields} from "./setting_elements/CreateShellSelectionFields";
import {createShellCommandField} from "./setting_elements/CreateShellCommandField";
import {createTabs, TabStructure} from "./setting_elements/Tabs";
import {debugLog} from "../Debug";
import {
    Documentation,
    GitHub,
} from "../Documentation";
import {getSC_Events} from "../events/SC_EventList";
import {SC_Event} from "../events/SC_Event";
import {TShellCommand} from "../TShellCommand";
import {
    CustomVariable,
    CustomVariableInstance,
    CustomVariableModel,
    getModel,
    createPATHAugmentationFields,
    Prompt,
    PromptModel,
    Shell,
} from "../imports";
import {createNewModelInstanceButton} from "../models/createNewModelInstanceButton";
import {
    ExecutionNotificationMode,
    PlatformId,
} from "./SC_MainSettings";
import {OutputWrapperModel} from "../models/output_wrapper/OutputWrapperModel";
import {OutputWrapper} from "../models/output_wrapper/OutputWrapper";
import {createVariableDefaultValueField} from "./setting_elements/createVariableDefaultValueFields";
import {CustomShellModel} from "../models/custom_shell/CustomShellModel";
import {CustomShellInstance} from "../models/custom_shell/CustomShellInstance";
import {createExecutionNotificationField} from "./setting_elements/createExecutionNotificationField";

/**
 * TODO: Rename to MainSettingsModal. Then it better in line with ShellCommandSettingsModal.
 */
export class SC_MainSettingsTab extends PluginSettingTab {
    private readonly plugin: SC_Plugin;

    private tab_structure: TabStructure;

    public setting_groups: SettingFieldGroupContainer = {};

    constructor(app: App, plugin: SC_Plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    public display(): void {
        const {containerEl} = this;

        containerEl.empty();

        this.tab_structure = createTabs(
            containerEl,
            {
                "main-shell-commands": {
                    title: "Shell commands",
                    icon: "run-command",
                    content_generator: (container_element: HTMLElement) => this.tabShellCommands(container_element),
                },
                "main-environments": {
                    title: "Environments",
                    icon: "stacked-levels",
                    content_generator: (container_element: HTMLElement) => this.tabEnvironments(container_element),
                },
                "main-preactions": {
                    title: "Preactions",
                    icon: "note-glyph",
                    content_generator: (container_element: HTMLElement) => this.tabPreactions(container_element),
                },
                "main-output": {
                    title: "Output",
                    icon: "lines-of-text",
                    content_generator: (container_element: HTMLElement) => this.tabOutput(container_element),
                },
                "main-events": {
                    title: "Events",
                    icon: "dice",
                    content_generator: (container_element: HTMLElement) => this.tabEvents(container_element),
                },
                "main-variables": {
                    title: "Variables",
                    icon: "code-glyph",
                    content_generator: (container_element: HTMLElement) => this.tabVariables(container_element),
                },
            },
            this.last_position.tab_name,
        );

        // Documentation link & GitHub links
        containerEl.createEl("p").insertAdjacentHTML("beforeend",
            "<a href=\"" + Documentation.index + "\">Documentation</a> - " +
            "<a href=\"" + GitHub.repository + "\">SC on GitHub</a> - " +
            "<a href=\"" + GitHub.changelog + "\">SC version: " + this.plugin.getPluginVersion() + "</a>",
        );

        // Copyright notice
        const copyright_paragraph = containerEl.createEl("p");
        copyright_paragraph.addClass("SC-small-font");
        copyright_paragraph.insertAdjacentHTML("beforeend", `
            <em>Shell commands</em> plugin Copyright &copy; 2021 - 2025 Jarkko Linnanvirta. This program comes with ABSOLUTELY NO WARRANTY. This is free software, and you are welcome to redistribute it under certain conditions. See more information in the license: <a href="${GitHub.license}">GNU GPL-3.0</a>.
        `);

        // KEEP THIS AFTER CREATING ALL ELEMENTS:
        // Scroll to the position when the settings modal was last open, but do it after content generating has finished.
        // In practise, shell command previews may take some time to appear.
        this.tab_structure.contentGeneratorPromises[this.tab_structure.active_tab_id].then(() => {
            this.rememberLastPosition(containerEl);
        });
    }

    private tabShellCommands(container_element: HTMLElement): Promise<void> {
        return new Promise((resolveWholeContent) => {
            
            // Display possible environment related warnings.
            this.displayGeneralWarnings(container_element);
            
            // Show a search field
            this.createSearchField(container_element);
    
            // A <div> element for all command input fields. New command fields can be created at the bottom of this element.
            const command_fields_container = container_element.createEl("div");
    
            // Fields for modifying existing commands
            let shell_commands_exist = false;
            const previewPromises: Promise<void>[] = [];
            for (const command_id in this.plugin.getTShellCommands()) {
                previewPromises.push(new Promise((resolveOnePreview) => {
                    createShellCommandField(
                        this.plugin,
                        command_fields_container,
                        this,
                        command_id,
                        this.plugin.settings.show_autocomplete_menu,
                        () => resolveOnePreview(),
                    );
                }));
                shell_commands_exist = true;
            }
            
            // After all shell commands' previews have been generated, resolve this tab's Promise.
            Promise.allSettled(previewPromises).then(() => resolveWholeContent());
    
            // 'No shell commands yet' paragraph.
            const no_shell_commands_paragraph = container_element.createEl("p", {text: "No shell commands yet, click the 'New shell command' button below."});
            if (shell_commands_exist) {
                // Shell commands exist, so do not show the "No shell commands yet" text.
                no_shell_commands_paragraph.hide();
            }
    
            // "New command" button
            new Setting(container_element)
                .addButton(button => button
                    .setButtonText("New shell command")
                    .onClick(async () => {
                        createShellCommandField(this.plugin, command_fields_container, this, "new", this.plugin.settings.show_autocomplete_menu);
                        no_shell_commands_paragraph.hide();
                        debugLog("New empty command created.");
                    })
                )
            ;
        });
    }
    
    private displayGeneralWarnings(containerElement: HTMLElement): void {
        // Installation type warnings.
        if (this.plugin.settings.show_installation_warnings) {
            switch (getObsidianInstallationType()) {
                case "Flatpak": {
                    const calloutContent: DocumentFragment = new DocumentFragment();
                    calloutContent.createEl("p").innerHTML = "When Obsidian is installed using Flatpak, shell commands are executed in an isolated environment, which may cause some commands not to work. <a href=\"" + Documentation.problems.flatpakInstallation + "\">Read more</a>.";
                    createCallout(
                        containerElement,
                        "warning",
                        "Flatpak installation detected - may cause execution failures",
                        calloutContent,
                    );
                }
            }
        }
    }

    private createSearchField(container_element: HTMLElement) {
        const search_container = container_element.createDiv();
        const search_title = "Search shell commands";
        const search_setting = new Setting(search_container)
            .setName(search_title)
            .setDesc("Looks up shell commands' aliases, commands, ids and icons.")
            .addSearch(search_component => search_component
                .onChange((search_term: string) => {
                    let count_matches = 0;
                    for (const shell_command_id in this.plugin.getTShellCommands()) {
                        let matched = false;
                        // Check if a search term was defined.
                        if ("" == search_term) {
                            // Show all shell commands.
                            matched = true;
                        } else {
                            // A search term is defined.
                            // Define fields where to look for the search term
                            const t_shell_command = this.plugin.getTShellCommands()[shell_command_id];
                            const search_targets: string[] = [
                                t_shell_command.getId(),
                                t_shell_command.getConfiguration().alias,
                            ];
                            search_targets.push(...Object.values(t_shell_command.getPlatformSpecificShellCommands()));
                            // Only include icon in the search if it's defined.
                            const icon: string | null = t_shell_command.getConfiguration().icon;
                            if (icon) {
                                search_targets.push(icon);
                            }

                            // Check if it's a match
                            search_targets.forEach((search_target: string) => {
                                if (search_target.toLocaleLowerCase().contains(search_term.toLocaleLowerCase())) {
                                    matched = true;
                                    debugLog("Search " + search_term + " MATCHED " + search_target);
                                }
                            });
                        }

                        // Show or hide the shell command.
                        const shell_command_element = document.querySelector("div.SC-id-" + shell_command_id);
                        if (!shell_command_element) {
                            throw new Error("Shell command setting element does not exist with selector div.SC-id-" + shell_command_id);
                        }
                        if (matched) {
                            shell_command_element.removeClass("SC-hide");
                            count_matches++;
                        } else {
                            shell_command_element.addClass("SC-hide");
                        }
                    }

                    // Display match count
                    if ("" == search_term) {
                        // Don't show match count.
                        search_setting.setName(search_title);
                    } else {
                        // Show match count.
                        switch (count_matches) {
                            case 0: {
                                search_setting.setName("No matches");
                                break;
                            }
                            case 1: {
                                search_setting.setName("1 match");
                                break;
                            }
                            default: {
                                search_setting.setName(count_matches + " matches");
                                break;
                            }
                        }
                    }
                }).then((search_component: SearchComponent) => {
                    // Focus on the search field.
                    search_component.inputEl.addClass("SC-focus-element-on-tab-opening");
                }),
            )
        ;
    }

    private async tabEvents(container_element: HTMLElement): Promise<void>  {

        // A general description about events
        container_element.createEl("p", {text: "Events introduce a way to execute shell commands automatically in certain situations, e.g. when Obsidian starts. They are set up for each shell command separately, but this tab contains general options for them."});

        // Enable/disable all events
        new Setting(container_element)
            .setName("Enable events")
            .setDesc("This is a quick way to immediately turn off all events, if you want.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enable_events)
                .onChange(async (enable_events: boolean) => {
                    // The toggle was clicked.
                    this.plugin.settings.enable_events = enable_events;
                    if (enable_events) {
                        // Register events.
                        this.plugin.registerSC_Events(true);
                    } else {
                        // Unregister events.
                        this.plugin.unregisterSC_Events();
                    }
                    await this.plugin.saveSettings();
                }),
            )
        ;

        // A list of current enable events
        container_element.createEl("p", {text: "The following gives just a quick glance over which events are enabled on which shell commands. To enable/disable events for a shell command, go to the particular shell command's settings via the 'Shell commands' tab. The list is only updated when you reopen the whole settings panel."});
        let found_enabled_event = false;
        getSC_Events(this.plugin).forEach((sc_event: SC_Event) => {
            const event_enabled_t_shell_commands = sc_event.getTShellCommands();
            // Has the event been enabled for any shell commands?
            if (event_enabled_t_shell_commands.length) {
                // Yes, it's enabled.
                // Show a list of shell commands
                const paragraph_element = container_element.createEl("p", {text: sc_event.static().getTitle()});
                const list_element = paragraph_element.createEl("ul");
                event_enabled_t_shell_commands.forEach((t_shell_command: TShellCommand) => {
                    list_element.createEl("li", {text: t_shell_command.getAliasOrShellCommand()});
                });
                found_enabled_event = true;
            }
        });
        if (!found_enabled_event) {
            container_element.createEl("p", {text: "No events are enabled for any shell commands."});
        }
    }

    private async tabVariables(container_element: HTMLElement): Promise<void> {
        // "Preview variables in command palette" field
        new Setting(container_element)
            .setName("Preview variables in command palette and menus")
            .setDesc("If on, variable names are substituted with their realtime values when you view your commands in the command palette and right click context menus (if used). A nice way to ensure your commands will use correct values.")
            .addToggle(checkbox => checkbox
                .setValue(this.plugin.settings.preview_variables_in_command_palette)
                .onChange(async (value: boolean) => {
                    debugLog("Changing preview_variables_in_command_palette to " + value);
                    this.plugin.settings.preview_variables_in_command_palette = value;
                    await this.plugin.saveSettings();
                })
            )
        ;

        // "Show autocomplete menu" field
        new Setting(container_element)
            .setName("Show autocomplete menu")
            .setDesc("If on, a dropdown menu shows up when you begin writing {{variable}} names, showing matching variables and their instructions. Also allows defining custom suggestions in autocomplete.yaml file - see the documentation.")
            .addToggle(checkbox => checkbox
                .setValue(this.plugin.settings.show_autocomplete_menu)
                .onChange(async (value: boolean) => {
                    debugLog("Changing show_autocomplete_menu to " + value);
                    this.plugin.settings.show_autocomplete_menu = value;
                    this.display(); // Re-render the whole settings view to apply the change.
                    await this.plugin.saveSettings();
                }),
            )
            .addExtraButton(extra_button => extra_button
                .setIcon("help")
                .setTooltip("Documentation: Autocomplete")
                .onClick(() => {
                    gotoURL(Documentation.variables.autocomplete.index);
                }),
            )
        ;

        // Custom variables
        new Setting(container_element)
            .setName("Custom variables")
            .setHeading() // Make the "Variables" text bold.
            .addExtraButton(extra_button => extra_button
                .setIcon("pane-layout")
                .setTooltip("Open a pane that displays all custom variables and their values.")
                .onClick(() => {
                    this.plugin.createCustomVariableView();
                }),
            )
            .addExtraButton(extra_button => extra_button
                .setIcon("help")
                .setTooltip("Documentation: Custom variables")
                .onClick(() => {
                    gotoURL(Documentation.variables.customVariables);
                }),
            )
        ;
        
        // General settings for CustomVariables.
        const custom_variable_container = container_element.createDiv();
        new Setting(custom_variable_container)
            .setName("Show notifications when values of custom variables change")
            .setDesc("Exception: no notifications will be shown for changing values manually via prompts.")
            .addDropdown(dropdownComponent => dropdownComponent
                .addOptions({
                    enabled: "Via URI: Notify",
                    disabled: "Via URI: Don't notify",
                })
                .setValue(this.plugin.settings.custom_variables_notify_changes_via.obsidian_uri ? "enabled" : "disabled")
                .onChange(async (selection: string) => {
                    this.plugin.settings.custom_variables_notify_changes_via.obsidian_uri = selection === "enabled";
                    await this.plugin.saveSettings();
                })
            )
            .addDropdown(dropdownComponent => dropdownComponent
                .addOptions({
                    enabled: "Via output assignment: Notify",
                    disabled: "Via output assignment: Don't notify",
                })
                .setValue(this.plugin.settings.custom_variables_notify_changes_via.output_assignment ? "enabled" : "disabled")
                .onChange(async (selection: string) => {
                    this.plugin.settings.custom_variables_notify_changes_via.output_assignment = selection === "enabled";
                    await this.plugin.saveSettings();
                })
            )
        ;

        // Settings for each CustomVariable
        const custom_variable_model = getModel<CustomVariableModel>(CustomVariableModel.name);
        this.plugin.getCustomVariableInstances().forEach((custom_variable_instance: CustomVariableInstance) => {
            custom_variable_model.createSettingFields(custom_variable_instance, custom_variable_container);
        });
        createNewModelInstanceButton<CustomVariableModel, CustomVariableInstance>(this.plugin, CustomVariableModel.name, container_element, custom_variable_container, this.plugin.settings);


        // Built-in variable instructions
        new Setting(container_element)
            .setName("Built-in variables")
            .setHeading() // Make the "Variables" text bold.
            .addExtraButton(extra_button => extra_button
                .setIcon("help")
                .setTooltip("Documentation: Built-in variables")
                .onClick(() => {
                    gotoURL(Documentation.variables.allVariables);
                }),
            )
        ;

        for (const variable of this.plugin.getVariables()) {
            if (!(variable instanceof CustomVariable)) {
                const variableSettingGroupElement = container_element.createDiv();
                variableSettingGroupElement.addClass("SC-setting-group");

                // Variable name and documentation link
                const variableHeadingSetting = new Setting(variableSettingGroupElement) // Use container_element instead of variableSettingGroup.
                    .setHeading()
                    .addExtraButton(extraButton => extraButton
                        .setIcon("help")
                        .setTooltip("Documentation: " + variable.getFullName() + " variable")
                        .onClick(() => gotoURL(variable.getDocumentationLink() as string)) // It's always a string, because the variable is not a CustomVariable.
                    )
                ;
                variableHeadingSetting.nameEl.insertAdjacentHTML("afterbegin", variable.getHelpName());

                // Variable description
                const variableDescriptionSetting = new Setting(variableSettingGroupElement)
                    .setClass("SC-full-description") // Without this, description would be shrunk to 50% of space. This setting does not have control elements, so 100% width is ok.
                ;
                variableDescriptionSetting.descEl.insertAdjacentHTML("afterbegin", variable.help_text);
                const availability_text: string = variable.getAvailabilityText();
                if (availability_text) {
                    variableDescriptionSetting.descEl.insertAdjacentHTML("beforeend", "<br>" + availability_text);
                }

                // Variable default value
                const defaultValueSettingTitle = "Default value for "+variable.getFullName();
                if (variable.isAlwaysAvailable()) {
                    new Setting(variableSettingGroupElement)
                        .setName(defaultValueSettingTitle)
                        .setDesc(variable.getFullName() + " is always available, so it cannot have a default value.")
                    ;
                } else {
                    createVariableDefaultValueField(
                        this.plugin,
                        variableSettingGroupElement,
                        defaultValueSettingTitle,
                        variable,
                    );
                }
            }
        }

        container_element.createEl("p", {text: "When you type variables into commands, a preview text appears under the command field to show how the command will look like when it gets executed with variables substituted with their real values."});
        container_element.createEl("p", {text: "Special characters in variable values are tried to be escaped (except if you use CMD as the shell in Windows). This is to improve security so that a variable won't accidentally cause bad things to happen. If you want to use a raw, unescaped value, add an exclamation mark before the variable's name, e.g. {{!title}}, but be careful, it's dangerous!"});
        container_element.createEl("p", {text: "There is no way to prevent variable parsing. If you need {{ }} characters in your command, they won't be parsed as variables as long as they do not contain any of the variable names listed above. If you need to pass e.g. {{title}} literally to your command, there is no way to do it atm, please create a discussion in GitHub."});
        container_element.createEl("p", {text: "All variables that access the current file, may cause the command preview to fail if you had no file panel active when you opened the settings window - e.g. you had focus on graph view instead of a note = no file is currently active. But this does not break anything else than the preview."});
    }

    private async tabEnvironments(container_element: HTMLElement): Promise<void>  {
        // "Working directory" field
        const platformName: string | undefined = getCurrentPlatformName();
        new Setting(container_element)
            .setName("Working directory")
            .setDesc("A directory where your commands will be run. If empty, defaults to your vault's location. Can be relative (= a folder in the vault) or absolute (= complete from " + platformName + " filesystem root). If you are using a shell that virtualizes another operating system than " + platformName + " (e.g. 'Windows Subsystem for Linux'), you should still enter a " + platformName + " formatted path. Your shell will do a conversion if needed.")
            .addText(text => text
                .setPlaceholder(getVaultAbsolutePath(this.app))
                .setValue(this.plugin.settings.working_directory)
                .onChange(async (value) => {
                    debugLog("Changing working_directory to " + value);
                    this.plugin.settings.working_directory = value;
                    await this.plugin.saveSettings();
                })
            )
        ;

        // Platforms' default shells
        const shellSelectionSettings = createShellSelectionFields(this.plugin, container_element, this.plugin.settings.default_shells, true);

        // CustomShells
        new Setting(container_element)
        .setName("Custom shells")
        .setDesc("Define e.g. WSL (Windows Subsystem for Linux), MinGW-w64 (Git Bash), or Wine here.")
        .setHeading() // Make the "Custom shells" text bold.
        .addExtraButton(extra_button => extra_button
            .setIcon("help")
            .setTooltip("Documentation: Custom shells")
            .onClick(() => {
                gotoURL(Documentation.environments.customShells.index);
            }),
        )
        ;

        // Settings for each CustomShell
        const customShellModel = getModel<CustomShellModel>(CustomShellModel.name);
        const customShellContainer = container_element.createDiv();
        this.plugin.getCustomShellInstances().forEach((customShellInstance: CustomShellInstance) => {
            customShellModel.createSettingFields(customShellInstance, customShellContainer);
        });
        createNewModelInstanceButton<CustomShellModel, CustomShellInstance>(
            this.plugin,
            CustomShellModel.name,
            container_element,
            customShellContainer,
            this.plugin.settings,
            (customShellInstance: CustomShellInstance, main_setting: Setting) => {
                // A new CustomShell is created.
                // Open settings modal.
                customShellModel.openSettingsModal(customShellInstance, main_setting).then(() => {
                    // CustomShellModal is closed. Can get a shell name now.
                    // Add the new shell to shell selection dropdown.
                    const customShellHostPlatformId: PlatformId = customShellInstance.configuration.host_platform;
                    shellSelectionSettings[customShellHostPlatformId].components.forEach((component: BaseComponent) => {
                        if (component instanceof DropdownComponent) {
                            // Add the new shell to the dropdown.
                            component.addOption(customShellInstance.getId(), customShellInstance.getTitle());
                        }
                    });
                });
            }
        );

        // PATH environment variable fields
        createPATHAugmentationFields(this.plugin, container_element, this.plugin.settings.environment_variable_path_augmentations);
    }

    private async tabPreactions(container_element: HTMLElement): Promise<void>  {

        // Prompts
        const prompt_model = getModel<PromptModel>(PromptModel.name);
        new Setting(container_element)
            .setName("Prompts")
            .setHeading() // Make the "Prompts" text to appear as a heading.
        ;
        const prompts_container_element = container_element.createDiv();
        this.plugin.getPrompts().forEach((prompt: Prompt) => {
            prompt_model.createSettingFields(prompt, prompts_container_element);
        });

        // 'New prompt' button
        createNewModelInstanceButton<PromptModel, Prompt>(
            this.plugin,
            PromptModel.name,
            container_element,
            prompts_container_element,
            this.plugin.settings,
            (instance: Prompt, mainSetting: Setting) => {
                prompt_model.openSettingsModal(instance, mainSetting); // Open the prompt settings modal, as the user will probably want to configure it now anyway.
            },
        );
    }

    private async tabOutput(container_element: HTMLElement): Promise<void>  {

        // Output wrappers
        const output_wrapper_model = getModel<OutputWrapperModel>(OutputWrapperModel.name);
        new Setting(container_element)
            .setName("Output wrappers")
            .setHeading() // Make the "Output wrappers" text to appear as a heading.
            .addExtraButton(extra_button => extra_button
                .setIcon("help")
                .setTooltip("Documentation: Output wrappers")
                .onClick(() => gotoURL(Documentation.outputHandling.outputWrappers))
            )
        ;
        const output_wrappers_container_element = container_element.createDiv();
        this.plugin.getOutputWrappers().forEach((output_wrapper: OutputWrapper) => {
            output_wrapper_model.createSettingFields(output_wrapper, output_wrappers_container_element);
        });

        // 'New output wrapper' button
        createNewModelInstanceButton<OutputWrapperModel, OutputWrapper>(
            this.plugin,
            OutputWrapperModel.name,
            container_element,
            output_wrappers_container_element,
            this.plugin.settings,
            (instance: OutputWrapper, mainSetting) => {
                output_wrapper_model.openSettingsModal(instance, mainSetting); // Open the output wrapper settings modal, as the user will probably want to configure it now anyway.
            },
        );


        // "Error message duration" field
        this.createNotificationDurationField(container_element, "Error message duration", "Concerns messages about failed shell commands.", "error_message_duration");

        // "Notification message duration" field
        this.createNotificationDurationField(container_element, "Notification message duration", "Concerns informational, non-fatal messages, e.g. output directed to 'Notification balloon'.", "notification_message_duration");

        // "Show a notification when executing shell commands" field
        createExecutionNotificationField(
            container_element,
            this.plugin.settings.execution_notification_mode,
            false, // This is main settings, so don't enable a "default" option.
            this.plugin.settings.notification_message_duration,
            async (newExecutionNotificationMode: ExecutionNotificationMode) => {
                // Save the change.
                this.plugin.settings.execution_notification_mode = newExecutionNotificationMode;
                await this.plugin.saveSettings();
            }
        );

        // "Outputting to 'Clipboard' displays a notification message, too" field
        new Setting(container_element)
            .setName(sanitizeHTMLToDom("Outputting to <em>Clipboard</em> displays a notification message, too"))
            .setDesc("If a shell command's output is directed to the clipboard, also show the output in a popup box in the top right corner. This helps to notice what was inserted into clipboard.")
            .addToggle(checkbox => checkbox
                .setValue(this.plugin.settings.output_channel_clipboard_also_outputs_to_notification)
                .onChange(async (value: boolean) => {
                    this.plugin.settings.output_channel_clipboard_also_outputs_to_notification = value;
                    await this.plugin.saveSettings();
                }),
            )
        ;
        
        // "Outputting to 'Notification/error balloon' uses monospace formatting" field.
        const initialNotificationDecoration: boolean | "stderr" = this.plugin.settings.output_channel_notification_decorates_output;
        new Setting(container_element)
            .setName(sanitizeHTMLToDom("Outputting to <em>Notification/error balloon</em> uses monospace formatting"))
            .setDesc("Monospace formatting is achieved by wrapping output in a <code></code> element. It's good for error messages, but not optimal for long natural language texts. The formatting is only applied for messages originating from shell command execution, not for the plugin's own error messages or notifications.")
            .addDropdown(dropdownComponent => dropdownComponent
                .addOptions({
                    all: "For stdout and stderr",
                    stderr: "For stderr only",
                    none: "Disable",
                })
                .setValue(initialNotificationDecoration === "stderr"
                    ? "stderr"
                    : initialNotificationDecoration ? "all" : "none"
                )
                .onChange(async (decorationOption: string) => {
                    switch (decorationOption) {
                        case "all":
                            this.plugin.settings.output_channel_notification_decorates_output = true;
                            break;
                        case "stderr":
                            this.plugin.settings.output_channel_notification_decorates_output = "stderr";
                            break;
                        case "none":
                            this.plugin.settings.output_channel_notification_decorates_output = false;
                            break;
                        default:
                            throw new Error("Unrecognized decorationOption: " + decorationOption);
                    }
                    await this.plugin.saveSettings();
                }),
            )
            .addExtraButton(fontButton => fontButton
                .setIcon("type-outline")
                .setTooltip("Manage Obsidian's Monospace font")
                .onClick(() => {
                    // Go to Appearance -> "Monospace font" setting.
                    
                    // @ts-ignore This is PRIVATE API access. Not good, but then again the feature is not crucial - if it breaks, it won't interrupt anything important.
                    const appearanceTabOpened = this.plugin.app.setting?.openTabById?.("appearance");
                    
                    if (appearanceTabOpened) {
                        // Try to look for the monospace font setting. This is a bit quirky and might not work if Obsidian changes the setting's name (or if user has other display language than English).
                        let settingFound = false;
                        document.querySelectorAll("div.setting-item-name").forEach((divSettingItemName: HTMLElement) => {
                            if (divSettingItemName.innerHTML.match(/^\s*Monospace font\s*$/i) && !settingFound) { // !settingFound: Don't search anymore if an element was already scrolled into view.
                                // Found the monospace font setting.
                                // Ensure it's in the view and make it bold.
                                divSettingItemName.scrollIntoView({
                                    behavior: "smooth",
                                    block: "center",
                                    inline: "nearest", // Horizontal alignment. Doesn't matter, there should be no horizontal scrolling.
                                });
                                divSettingItemName.style.fontWeight = "bold"; // Highlight the setting.
                                settingFound = true;
                            }
                        });
                        if (!settingFound) {
                            // No luck this time finding the setting.
                            this.plugin.newNotification("Please look for \"Monospace font\" setting.");
                        }
                    }
                    else {
                        // "Appearance" tab opening failed.
                        this.plugin.newNotification("I'm not able to show the setting for you. Please look for \"Appearance\" -> \"Monospace font\".");
                    }
                })
            )
        ;
    }

    private createNotificationDurationField(container_element: HTMLElement, title: string, description: string, setting_name: "error_message_duration" | "notification_message_duration") {
        new Setting(container_element)
            .setName(title)
            .setDesc(description + " In seconds, between 1 and 180.")
            .addText(field => field
                .setValue(String(this.plugin.settings[setting_name]))
                .onChange(async (duration_string: string) => {
                    const duration: number = parseInt(duration_string);
                    if (duration >= 1 && duration <= 180) {
                        debugLog("Change " + setting_name + " from " + this.plugin.settings[setting_name] + " to " + duration);
                        this.plugin.settings[setting_name] = duration;
                        await this.plugin.saveSettings();
                        debugLog("Changed.");
                    }
                    // Don't show a notice if duration is not between 1 and 180, because this function is called every time a user types in this field, so the value might not be final.
                })
            )
        ;
    }

    private last_position: {
        scroll_position: number;
        tab_name: string;
    } = {
        scroll_position: 0,
        tab_name: "main-shell-commands",
    };
    private rememberLastPosition(container_element: HTMLElement) {
        const last_position = this.last_position;

        // Go to last position now
        this.tab_structure.buttons[last_position.tab_name].click();
        // window.setTimeout(() => { // Need to delay the scrolling a bit. Without this, something else would override scrolling and scroll back to 0.
            container_element.scrollTo({
                top: this.last_position.scroll_position,
                behavior: "auto",
            });
        // }, 0); // 'timeout' can be 0 ms, no need to wait any longer.
        // I guess there's no need for setTimeout() anymore, as rememberLastPosition() is now called after waiting for asynchronous tab content generating is finished.
        // TODO: Remove the commented code after a while.

        // Listen to changes
        container_element.addEventListener("scroll", (event) => {
            this.last_position.scroll_position = container_element.scrollTop;
        });
        for (const tab_name in this.tab_structure.buttons) {
            const button = this.tab_structure.buttons[tab_name];
            button.onClickEvent((event: MouseEvent) => {
                last_position.tab_name = tab_name;
            });
        }
    }
}

export interface SettingFieldGroup {
    name_setting: Setting;
    shell_command_setting: Setting;
    preview_setting: Setting;
    refreshPreview: (shell: Shell | null) => Promise<void>;
}

export interface SettingFieldGroupContainer {
    [key: string]: SettingFieldGroup,
}