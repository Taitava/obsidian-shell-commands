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
import {SC_Event} from "../events/SC_Event";
import {
    VariableMap,
    VariableSet,
} from "./loadVariables";
import {
    IRawArguments,
    Variable,
    VariableValueResult,
} from "./Variable";
import {TShellCommand} from "../TShellCommand";
import {removeFromSet} from "../Common";
import {Shell} from "../shells/Shell";

/**
 * @param plugin
 * @param content
 * @param shell Used 1) to determine how to escape special characters in variable values (if escapeVariables is true), and 2) do correct path normalization (for variables that return file system paths).
 * @param escapeVariables If true, special characters in variable values are quoted (but this might be prevented if a variable starts with {{! instead of {{ ). If false, dno escaping is ever done.
 * @param t_shell_command Will only be used to read default value configurations. Can be null if no TShellCommand is available, but then no default values can be accessed.
 * @param sc_event Use undefined, if parsing is not happening during an event.
 * @param variables If you want to parse only a certain set of variables, define them in this parameter. If this is omitted, all variables will be parsed.
 * @param raw_value_augmenter A callback that will be called before every substitution. Allows modifying or completely changing the resulted variable values.
 * @param escaped_value_augmenter Same as raw_value_augmenter, but called after escaping the value. Can be used to for example wrap values in html elements for displaying purposes.
 * @return ParsingResult
 */
export async function parseVariables(
        plugin: SC_Plugin,
        content: string,
        shell: Shell,
        escapeVariables: boolean,
        t_shell_command: TShellCommand | null,
        sc_event?: SC_Event | null,
        variables: VariableSet = plugin.getVariables(),
        raw_value_augmenter: ((variable: Variable, raw_value: VariableValueResult) => void) | null = null,
        escaped_value_augmenter: ((variable: Variable, escaped_value: string, originalValue: string) => string) | null = null,
    ): Promise<ParsingResult> {

    debugLog("parseVariables(): Starting to parse " + content + " with " + variables.size + " variables.");

    // Initialize a parsing result object
    const parsing_result: ParsingResult = {
        original_content: content,
        parsed_content: content, // Create a copy of the variable because we don't want to alter the original value of 'content' during iterating its regex matches. Originally this copy was just another local variable, but now it's changed to be a property in an object.
        succeeded: false,
        error_messages: [],
        count_parsed_variables: 0,
    };

    for (const variable of variables)
    {
        const pattern = getVariableRegExp(variable);
        const parameter_names = variable.getParameterNames();
        let argument_matches: RegExpExecArray | null;
        while ((argument_matches = pattern.exec(content)) !== null) {
            // Count how many times any variables have appeared.
            parsing_result.count_parsed_variables++;

            // Remove stuff that should not be iterated in a later loop.
            /** Need to prefix with _ because JavaScript reserves the variable name 'arguments'. */
            const _arguments = argument_matches.filter((value: unknown /* Won't be used */, key: unknown) => {
                return "number" === typeof key;
                // This leaves out for example the following non-numeric keys (and their values):
                // - "groups"
                // - "index"
                // - "input"
                // In the future, there can also come more elements that will be skipped. E.g. "indices". See: https://github.com/nothingislost/obsidian-dynamic-highlights/issues/25#issuecomment-1038563990 (referenced 2022-02-22).
            });

            // Get the {{variable}} string that will be substituted (= replaced with the actual value of the variable).
            const substitute: string = _arguments.shift() as string; // '_arguments[0]' contains the whole match, not just an argument. Get it and remove it from '_arguments'. 'as string' is used to tell TypeScript that _arguments[0] is always defined.

            // Iterate all arguments
            const presentArguments: IRawArguments = {};
            for (const i in _arguments) {
                // Check that the argument is not omitted. It can be omitted (= undefined), if the parameter is optional.
                if (undefined !== _arguments[i]) {
                    // The argument is present.
                    const argument = _arguments[i].slice(1); // .slice(1): Remove a preceding :
                    const parameter_name = parameter_names[i];
                    presentArguments[parameter_name] = argument;
                }
            }

            // Should the variable's value be escaped? (Usually yes).
            let escapeCurrentVariable = escapeVariables;
            if (doesOccurrenceDenyEscaping(substitute)) {
                // The variable usage begins with {{! instead of {{
                // This means the variable's value should NOT be escaped.
                escapeCurrentVariable = false;
            }

            // Render the variable
            const variable_value_result = await variable.getValue(
                shell,
                t_shell_command,
                sc_event,
                presentArguments,

                // Define a recursive callback that can be used to parse possible variables in a default value of the current variable.
                (raw_default_value) => {
                    // Avoid circular references by removing the current variable from the set of parseable variables.
                    // This will cumulate in deep nested parsing: Possible deeper parsing rounds will always have narrower
                    // and narrower sets of variables to parse.
                    const reduced_variables = removeFromSet(variables, variable);
                    return parseVariables(
                        plugin,
                        raw_default_value,
                        shell,
                        false, // Disable escaping special characters at this phase to avoid double escaping, as escaping will be done later.
                        t_shell_command,
                        sc_event,
                        reduced_variables,
                        raw_value_augmenter,
                        escaped_value_augmenter,
                    );
                },
            );

            // Allow custom modification of the raw value.
            if (raw_value_augmenter) {
                // The augmenter can modify the content of the variable_value_result object.
                raw_value_augmenter(variable, variable_value_result);
            }
            const raw_variable_value = variable_value_result.value;

            // Check possible error messages that might have come from rendering.
            if (variable_value_result.succeeded) {
                // Parsing was ok.

                // Escape the value if needed.
                let use_variable_value: string;
                if (escapeCurrentVariable) {
                    // Use an escaped value.
                    use_variable_value = (shell as Shell).escapeValue( // shell is always a Shell object when escapeCurrentVariable is true.
                        raw_variable_value as string, // raw_variable_value is always a string when variable_value_result.succeeded is true.
                    );
                } else {
                    // No escaping is wanted, so use the raw value.
                    use_variable_value = raw_variable_value as string; // raw_variable_value is always a string when variable_value_result.succeeded is true.
                }

                // Augment the escaped value, if wanted.
                if (escaped_value_augmenter) {
                    use_variable_value = escaped_value_augmenter(variable, use_variable_value, raw_variable_value as string);
                }

                // Replace the variable name with the variable value.
                parsing_result.parsed_content = (parsing_result.parsed_content as string /* not null */).replace(substitute, () => {
                    // Do the replacing in a function in order to avoid a possible $ character to be interpreted by JavaScript to interact with the regex.
                    // More information: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace#specifying_a_string_as_a_parameter (referenced 2021-11-02.)
                    return use_variable_value;
                });
            } else {
                // There has been problem(s) with this variable.
                debugLog("parseVariables(): Parsing content " + content + " failed.");
                parsing_result.succeeded = false;
                parsing_result.parsed_content = null;
                parsing_result.error_messages = variable_value_result.error_messages; // Returning now prevents parsing rest of the variables.
                return parsing_result;
            }
        }
    }
    debugLog("parseVariables(): Parsing content succeeded: From '" + content + "' to '" + parsing_result.parsed_content + "'");
    parsing_result.succeeded = true;
    return parsing_result;
}

/**
 * Parses just a single Variable in content, and does it synchronously. An alternative to parseVariables() in situations
 * where asynchronous functions should be avoided, e.g. in Obsidian Command palette, or file/folder/editor menus (although
 * this is not used in those menus atm).
 *
 * @param content
 * @param variable Can only be a Variable that implements the method generateValueSynchronously(). Otherwise an Error is thrown. Also, does not support variables that have parameters, at least at the moment.
 * @param shell
 * @return A ParsingResult similar to what parseVariables() returns, but directly, not in a Promise.
 */
export function parseVariableSynchronously(
        content: string,
        variable: Variable,
        shell: Shell,
    ): ParsingResult {
    if (variable.getParameterNames().length > 0) {
        throw new Error("parseVariableSynchronously() does not support variables with parameters at the moment. Variable: " + variable.constructor.name);
    }

    const parsingResult: ParsingResult = {
        // Initial values, will be overridden.
        succeeded: false,
        original_content: content,
        parsed_content: null,
        error_messages: [],
        count_parsed_variables: 0,
    };

    // Get the Variable's value.
    const variableValueResult: VariableValueResult = variable.getValueSynchronously(); // Shell could be passed here as a parameter, if there will ever be a need to use this method to access any variables that need the Shell (e.g. file path related variables that do path translation). It's not done now, as there's no need for now.

    if (variableValueResult.succeeded) {
        // Parsing succeeded.
        parsingResult.succeeded = true;
        parsingResult.parsed_content = content.replaceAll(
            getVariableRegExp(variable), // Even thought this regexp actually supports arguments, supplying arguments to variables is not implemented in variable.getValueSynchronously(), so variables expecting parameters cannot be supported at the moment.
            (occurrence: string) => {
                parsingResult.count_parsed_variables++; // The count is not used (at least at the moment of writing this), but might be used in the future.

                // Check if special characters should be escaped or not.
                const escape = !doesOccurrenceDenyEscaping(occurrence);
                if (escape) {
                    // Do escape.
                    return shell.escapeValue(variableValueResult.value as string);
                } else {
                    // No escaping.
                    return variableValueResult.value as string; // Replace {{variable}} with a value.
                }
            },
        );
    } else {
        // Parsing failed.
        parsingResult.error_messages = variableValueResult.error_messages;
    }

    return parsingResult;
}

/**
 * Reads all variables from the content string, and returns a VariableSet containing all the found variables.
 *
 * This is needed in situations where variables will not be parsed (= variable values are not needed), but where it's just
 * needed to know what variables e.g. a shell command relies on.
 *
 * @param plugin
 * @param contents Can be a single string, or an array of strings, if it's needed to look for variables in multiple contents (e.g. all platform versions of a shell command).
 * @param searchForVariables If not defined, will use all variables.
 */
export function getUsedVariables(
        plugin: SC_Plugin,
        contents: string[] | string,
        searchForVariables: VariableSet | Variable = plugin.getVariables(),
    ): VariableMap {
    if (searchForVariables instanceof Variable) {
        // searchForVariables is a single Variable.
        // Convert it to a VariableSet.
        searchForVariables = new VariableSet([searchForVariables]);
    }
    if (typeof contents === "string") {
        // contents is a single content. Convert it to an array.
        contents = [contents];
    }
    const found_variables = new VariableMap();

    for (const variable of searchForVariables)
    {
        const pattern = getVariableRegExp(variable);
        for (const content of contents) {
            if (pattern.exec(content) !== null) {
                // This variable was found.
                found_variables.set(variable.getIdentifier(), variable);
                break;
            }
        }
    }

    return found_variables;
}

function getVariableRegExp(variable: Variable) {
    return new RegExp(variable.getPattern(), "igu"); // i: case-insensitive; g: match all occurrences instead of just the first one. u: support 4-byte unicode characters too.
}

function doesOccurrenceDenyEscaping(occurrence: string): boolean {
    return "{{!" === occurrence.slice(0, 3); // .slice(0, 3) = get characters 0...2, so stop before 3. The 'end' parameter is confusing.
}

export interface ParsingResult {
    original_content: string;

    /**
     * This is null if succeeded is false.
     * */
    parsed_content: string | null;

    succeeded: boolean;
    error_messages: string[];
    count_parsed_variables: number;
}

/*
// TODO: Rewrite ParsingResult to the following format that better defines the 'succeeded' property's relationship to 'parsed_content' and 'error_messages'.
// Then find all "parsed_content as string" expressions in the whole project and remove the "as string" parts, they should be redundant after this change.

export type ParsingResult = ParsingResultSucceeded | ParsingResultFailed;

interface ParsingResultSucceeded extends ParsingResultBase {
    succeeded: true;
    parsed_content: string;
    error_messages: []; // An always empty array.
}

interface ParsingResultFailed extends ParsingResultBase {
    succeeded: false;
    parsed_content: null;
    error_messages: [string, ...string[]]; // A non-empty array of strings.
}

interface ParsingResultBase {
    original_content: string;
    count_parsed_variables: number;
}
 */