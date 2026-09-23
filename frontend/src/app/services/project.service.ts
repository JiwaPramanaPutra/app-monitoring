import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { SiteNode, buildSiteTree, extractSiteNames } from '../shared/site-hierarchy';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class ProjectService {
  private apiUrl = '/api/projects';

  private siteTreeSubject = new BehaviorSubject<SiteNode[]>([]);
  public siteTree$ = this.siteTreeSubject.asObservable();

  private sitesSubject = new BehaviorSubject<string[]>([]);
  public sites$ = this.sitesSubject.asObservable();

  private projectsSubject = new BehaviorSubject<any[]>([]);
  public projects$ = this.projectsSubject.asObservable();

  constructor(private http: HttpClient) {
    this.refreshProjects();
  }

  refreshProjects() {
    this.http.get<any>(this.apiUrl).subscribe({
      next: (res) => {
        if (res.success && res.projects) {
          this.projectsSubject.next(res.projects);
          this.siteTreeSubject.next(buildSiteTree(res.projects));
          this.sitesSubject.next(extractSiteNames(res.projects));
        }
      },
      error: (err) => console.error('Failed to load projects', err)
    });
  }

  createProject(projectData: any): Observable<any> {
    return this.http.post<any>(this.apiUrl, projectData);
  }

  updateProject(id: string, projectData: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/${id}`, projectData);
  }

  deleteProject(id: string): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/${id}`);
  }
}
