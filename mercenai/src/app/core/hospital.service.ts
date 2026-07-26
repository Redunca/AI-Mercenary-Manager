import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class HospitalService {
  private http = inject(HttpClient);

  admitRecruit(recruitId: number): Promise<any> {
    return firstValueFrom(this.http.post(`/api/hospital/${recruitId}/admit`, {}));
  }

  dischargeRecruit(recruitId: number): Promise<any> {
    return firstValueFrom(this.http.post(`/api/hospital/${recruitId}/discharge`, {}));
  }
}
