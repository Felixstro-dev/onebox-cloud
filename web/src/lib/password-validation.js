export const PASSWORD_MIN_LENGTH = 10;

export function setupPasswordErrors(password, repeat, {
  passwordTouched = false,
  repeatTouched = false,
  submitted = false,
} = {}) {
  const passwordError = (passwordTouched || submitted) && password.length < PASSWORD_MIN_LENGTH
    ? `Das Passwort muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen lang sein.` : '';
  const mismatch = (repeatTouched || submitted) && repeat.length > 0 && password !== repeat;
  const repeatError = mismatch
    ? 'Die Passwörter stimmen nicht überein.'
    : (submitted && !repeat ? 'Bitte wiederhole das Passwort.' : '');
  return { passwordError, repeatError };
}
