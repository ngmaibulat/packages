import assert from 'node:assert'
import test from 'node:test'
import { getFileType } from '@/fileType'

test('detect json file', async () => {
    const res = getFileType('package.json')

    // libmagic's exact wording is version-dependent — it reports "JSON data" on
    // older releases and "JSON text data" on newer ones. Assert the part that
    // identifies the format, not the phrasing.
    assert.match(res, /JSON/)
})
