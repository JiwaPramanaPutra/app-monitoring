const test = require('node:test');
const assert = require('node:assert');
const { normalizeNestedIds } = require('../services/project-utils');

test('local mode replaces temp ids at every nesting level', () => {
    const project = {
        sites: [{
            _id: 'temp_1', name: 'A',
            gedungList: [{ _id: 'temp_g', name: 'G', floors: [{ _id: 'temp_f', name: 'F' }] }]
        }]
    };
    normalizeNestedIds(project, 'local');
    assert.ok(!project.sites[0]._id.startsWith('temp_'));
    assert.ok(!project.sites[0].gedungList[0]._id.startsWith('temp_'));
    assert.ok(!project.sites[0].gedungList[0].floors[0]._id.startsWith('temp_'));
});

test('local mode assigns a stable id when one is absent', () => {
    const project = { sites: [{ name: 'A' }] };
    normalizeNestedIds(project, 'local');
    assert.ok(project.sites[0]._id);
    assert.ok(!project.sites[0]._id.startsWith('temp_'));
});

test('local mode keeps an existing stable id', () => {
    const project = { sites: [{ _id: 'site_keep', name: 'A' }] };
    normalizeNestedIds(project, 'local');
    assert.strictEqual(project.sites[0]._id, 'site_keep');
});

test('mongo mode removes temp ids and keeps ObjectId-like ids', () => {
    const project = { sites: [{ _id: 'temp_1', name: 'A' }, { _id: '507f1f77bcf86cd799439011', name: 'B' }] };
    normalizeNestedIds(project, 'mongo');
    assert.ok(!('_id' in project.sites[0]));
    assert.strictEqual(project.sites[1]._id, '507f1f77bcf86cd799439011');
});
