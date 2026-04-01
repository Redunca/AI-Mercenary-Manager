import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'sanitize',
  standalone: true
})
export class SanitizePipe implements PipeTransform {

  transform(value: string): string {
    var replacementRegEx = new RegExp(/[^a-z0-9 ]/g);
    var sanitizedString = value.toLowerCase().trim().replaceAll(replacementRegEx, '').replaceAll(' ', '-');
    return sanitizedString;
  }

}
