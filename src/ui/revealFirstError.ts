/**
 * After a form fails validation, bring the first error into view and focus its field, so pressing a
 * button never looks like «nothing happened» while the message sits below the fold. Call it right after
 * setting the errors; it waits a frame for them to render.
 */
export function revealFirstError(scope: ParentNode = document) {
  window.setTimeout(() => {
    const field = scope.querySelector<HTMLElement>('[aria-invalid="true"]');
    const message = scope.querySelector<HTMLElement>('[role="alert"]');
    const target = field ?? message;
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (field) field.focus({ preventScroll: true });
  }, 60);
}
