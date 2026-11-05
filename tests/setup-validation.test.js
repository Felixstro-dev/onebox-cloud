import test from 'node:test';
import assert from 'node:assert/strict';
import { PASSWORD_MIN_LENGTH, setupPasswordErrors } from '../web/src/lib/password-validation.js';

const submitted = { submitted: true };

test('Setup-Passwortvalidierung vergleicht unveränderte Werte', async (t) => {
  await t.test('zwei identische gültige Passwörter', () => {
    assert.deepEqual(setupPasswordErrors('1234567890', '1234567890', submitted), {
      passwordError: '', repeatError: '',
    });
  });

  await t.test('zwei unterschiedliche Passwörter', () => {
    assert.equal(setupPasswordErrors('1234567890', '123456789x', submitted).repeatError, 'Die Passwörter stimmen nicht überein.');
  });

  await t.test('Passwort unterhalb der Mindestlänge', () => {
    assert.equal(setupPasswordErrors('123456789', '123456789', submitted).passwordError, `Das Passwort muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen lang sein.`);
  });

  await t.test('Passwort exakt an der Mindestlänge', () => {
    assert.equal(setupPasswordErrors('1234567890', '1234567890', submitted).passwordError, '');
  });

  await t.test('Leerzeichen innerhalb des Passworts bleiben erhalten', () => {
    assert.deepEqual(setupPasswordErrors('12345 67890', '12345 67890', submitted), {
      passwordError: '', repeatError: '',
    });
  });

  await t.test('Leerzeichen am Anfang oder Ende bleiben erhalten', () => {
    assert.deepEqual(setupPasswordErrors(' 123456789', ' 123456789', submitted), {
      passwordError: '', repeatError: '',
    });
    assert.equal(setupPasswordErrors('123456789 ', '123456789', submitted).repeatError, 'Die Passwörter stimmen nicht überein.');
  });

  await t.test('Wiederholung wird während der Eingabe noch nicht rot', () => {
    assert.equal(setupPasswordErrors('1234567890', '1').repeatError, '');
  });
});
