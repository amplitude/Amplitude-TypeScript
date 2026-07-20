export interface TransformerOptions {
  /**
   * Additional JSX component names treated as pressable (onPress / onLongPress).
   * Merged with the built-in defaults (Button, Pressable, TouchableOpacity, etc.).
   */
  pressableElements?: string[];

  /**
   * Additional JSX component names treated as value-change elements (onValueChange).
   * Merged with the built-in defaults (Switch, Slider, Picker).
   */
  valueChangeElements?: string[];

  /**
   * Additional JSX component names treated as text-change elements (onChangeText / onSubmitEditing).
   * Merged with the built-in defaults (TextInput).
   */
  textChangeElements?: string[];
}
