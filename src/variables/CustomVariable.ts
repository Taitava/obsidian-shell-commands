import {Variable} from "./Variable";
import SC_Plugin from "../main";
import {CustomVariableInstance} from "../models/custom_variable/CustomVariableInstance";

/**
 * This class serves as the actual operational variable class for custom variables. It's paired with the CustomVariableInstance class, which acts
 * as a configuration class to handle settings together with CustomVariableModel class.
 */
export class CustomVariable extends Variable {

    private value: string | null = null; // TODO: When implementing variable types, make this class abstract and let subclasses define the type of this property.

    constructor(plugin: SC_Plugin, custom_variable_instance: CustomVariableInstance) {
        super(plugin);
        this.variable_name = custom_variable_instance.getPrefixedName();
        this.help_text = custom_variable_instance.configuration.description;
    }

    protected generateValue(): string | null {
        return undefined;
    }

    public getValue() {
        if (null === this.value) {
            // TODO: Implement default value ability.
            this.newErrorMessage("This custom variable does not have a value yet, and no default value is defined.")
            return null;
        }
        return this.value;
    }

    public setValue(value: string) {
        const old_value = this.value;
        this.value = value;

        // Call the onChange hook.
        this.callOnChangeCallbacks(value, old_value ?? ""); // Use "" if old_value is null.
    }

    /**
     * Adds the given callback function to a stack of functions that will be called whenever this CustomVariable's value changes.
     * @param on_change_callback
     */
    public onChange(on_change_callback: TCustomVariableOnChangeCallback) {
        this.on_change_callbacks.add(on_change_callback);
    }
    private on_change_callbacks = new Set<TCustomVariableOnChangeCallback>();

    private callOnChangeCallbacks(new_value: string, old_value: string) {
        for (const on_change_callback of this.on_change_callbacks) {
            on_change_callback(this, new_value, old_value);
        }
    }
}

type TCustomVariableOnChangeCallback = (variable: CustomVariable, new_value: string, old_value: string) => void;