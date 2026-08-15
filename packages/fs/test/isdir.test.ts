import assert from 'node:assert'
import test from 'node:test'
import { isDir } from '@/dir'

test('test src dir exists', async () => {
    const res = await isDir('./src')
    assert.equal(res, true)
})

test('test non-existent dir', async () => {
    const res = await isDir('./Karamba')
    assert.equal(res, false)
})

test('test throw error', async () => {
    async function shouldFail() {
        const res = await isDir('')
    }

    assert.rejects(shouldFail, {
        message: 'Invalid Argument',
    })
})

test('test throw simple error', async () => {
    async function shouldFail() {
        throw new Error('Invalid Argument')
    }

    const err = new Error('Invalid Argument')

    assert.rejects(shouldFail, err)
})
