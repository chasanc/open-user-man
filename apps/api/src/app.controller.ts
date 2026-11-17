import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service.js';

@ApiTags('health')
@Controller('health')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOkResponse({ description: 'Process is up (HTTP). gRPC binds separately.' })
  getHealth(): { status: string; name: string } {
    return this.appService.getHealth();
  }
}
