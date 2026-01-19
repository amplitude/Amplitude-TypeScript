export interface FormInteractionsOptions {
  /**
   * A callback function to control when form submit events are tracked.
   * Use this for custom form validation logic when native HTML5 validation is disabled
   * (e.g., forms with the `novalidate` attribute).
   *
   * Note: This only controls the `[Amplitude] Form Submitted` event, not the
   * `[Amplitude] Form Started` event which is tracked on first field change.
   *
   * @param event - The SubmitEvent triggered by the form submission
   * @returns `true` to track the form submit event, `false` to skip tracking
   *
   * @example
   * ```typescript
   * // Track only when form passes custom validation
   * formInteractions: {
   *   shouldTrackSubmit: (event) => {
   *     const form = event.target as HTMLFormElement;
   *     return form.checkValidity() && myCustomValidation(form);
   *   }
   * }
   * ```
   */
  shouldTrackSubmit?: (event: SubmitEvent) => boolean;
}
