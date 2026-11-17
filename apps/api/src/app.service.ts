import { Injectable } from '@nestjs/common';
import { PRODUCT_NAME } from '@oum/domain';

@Injectable()
export class AppService {
  getHealth(): { status: string; name: string } {
    return { status: 'ok', name: PRODUCT_NAME };
  }
}
