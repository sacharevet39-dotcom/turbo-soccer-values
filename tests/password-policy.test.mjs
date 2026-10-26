import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ADMIN_PASSWORD_MAX_LENGTH,
  ADMIN_PASSWORD_MIN_LENGTH,
  isStrongAdminPassword,
  randomStrongAdminPassword,
} from '../shared/password-policy.js'

test('password policy requires length and all four character groups', () => {
  assert.equal(ADMIN_PASSWORD_MIN_LENGTH, 12)
  assert.equal(isStrongAdminPassword('StrongPassword9!'), true)
  assert.equal(isStrongAdminPassword('shortA1!'), false)
  assert.equal(isStrongAdminPassword('lowercasepassword9!'), false)
  assert.equal(isStrongAdminPassword('UPPERCASEPASSWORD9!'), false)
  assert.equal(isStrongAdminPassword('NoDigitsOrSymbol'), false)
  assert.equal(isStrongAdminPassword(`Aa1!${'x'.repeat(ADMIN_PASSWORD_MAX_LENGTH - 4)}`), true)
  assert.equal(isStrongAdminPassword(`Aa1!${'x'.repeat(ADMIN_PASSWORD_MAX_LENGTH - 3)}`), false)
})

test('generated temporary passwords satisfy the configured Auth policy', () => {
  for (let index = 0; index < 25; index += 1) {
    const password = randomStrongAdminPassword()
    assert.equal(password.length, 60)
    assert.equal(isStrongAdminPassword(password), true)
  }
})
