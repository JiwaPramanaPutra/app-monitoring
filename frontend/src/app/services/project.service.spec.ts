import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ProjectService } from './project.service';

describe('ProjectService', () => {
  let service: ProjectService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(ProjectService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('emits site tree and site names from a successful projects response', () => {
    const siteNames: string[] = [];
    const treeLabels: string[] = [];

    service.sites$.subscribe(names => siteNames.push(...names));
    service.siteTree$.subscribe(tree => treeLabels.push(...tree.map(node => node.label)));

    const req = httpMock.expectOne('/api/projects');
    req.flush({
      success: true,
      projects: [
        {
          name: 'Demo Organization',
          sites: [{ name: 'Site Alpha' }, { name: 'Site Beta' }]
        }
      ]
    });

    expect(siteNames).toEqual(['Site Alpha', 'Site Beta']);
    expect(treeLabels).toEqual(['Demo Organization']);
  });
});
