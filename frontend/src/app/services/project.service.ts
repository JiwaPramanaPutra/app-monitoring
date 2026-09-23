import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { SiteNode } from '../shared/site-hierarchy';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class ProjectService {
  private apiUrl = 'http://localhost:3000/api/projects';
  
  private siteTreeSubject = new BehaviorSubject<SiteNode[]>([]);
  public siteTree$ = this.siteTreeSubject.asObservable();

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
          this.siteTreeSubject.next(this.buildTree(res.projects));
        }
      },
      error: (err) => console.error('Failed to load projects', err)
    });
  }

  private buildTree(projects: any[]): SiteNode[] {
    return projects.map(p => ({
      label: p.name,
      children: (p.sites || []).map((s: any) => ({
        label: s.name,
        siteValue: s.name,
        children: (s.gedungList || []).map((g: any) => ({
          label: g.name,
          siteValue: s.name,
          buildingValue: g.name,
          children: (g.floors || []).map((f: any) => ({
            label: f.name,
            siteValue: s.name,
            buildingValue: g.name
          }))
        }))
      }))
    }));
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
