import assert from 'node:assert/strict';
import { applyBase, projectTalkUrl } from '../src/lib/site-path.ts';

const cases=[
 ['/', '/works/', '/works/'],
 ['/projects/', '/works/', '/works/projects/'],
 ['/projects/?group=games', '/works/', '/works/projects/?group=games'],
 ['/lab/#evolution', '/works/', '/works/lab/#evolution'],
 ['/media/ssframework/one.webp', '/works/', '/works/media/ssframework/one.webp'],
 ['/works/projects/', '/works/', '/works/projects/'],
 ['/projects/', '/', '/projects/'],
 ['#engineering', '/works/', '#engineering'],
 ['https://example.com/path/', '/works/', 'https://example.com/path/'],
 ['//example.com/media.webp', '/works/', '//example.com/media.webp'],
 ['mailto:liss@example.com', '/works/', 'mailto:liss@example.com'],
 ['/projects/', '/portfolio/works/', '/portfolio/works/projects/'],
 ['/', '/liss-works/', '/liss-works/'],
 ['/projects/', '/liss-works/', '/liss-works/projects/'],
 ['/projects/ssframework/#engineering', '/liss-works/', '/liss-works/projects/ssframework/#engineering'],
 ['/media/ssframework/one.webp', '/liss-works/', '/liss-works/media/ssframework/one.webp'],
 ['/liss-works/projects/', '/liss-works/', '/liss-works/projects/'],
 ['/tools/mkfun/index.html', '/liss-works/', '/liss-works/tools/mkfun/index.html'],
 ['/tools/utilities/index.html#rename', '/liss-works/', '/liss-works/tools/utilities/index.html#rename'],
];
for(const [value,base,expected] of cases)assert.equal(applyBase(value,base),expected);
assert.equal(projectTalkUrl('ssframework'),'https://liss.pythonanywhere.com/projects/ssframework/talk/');
assert.equal(projectTalkUrl('a/b'),'https://liss.pythonanywhere.com/projects/a%2Fb/talk/');
console.log(`${cases.length+2} site path and discussion URL checks passed`);
