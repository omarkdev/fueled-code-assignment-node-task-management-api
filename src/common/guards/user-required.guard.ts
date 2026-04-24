import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { CLS_USER_ID_KEY } from '../constants';

@Injectable()
export class UserRequiredGuard implements CanActivate {
  constructor(private readonly cls: ClsService) {}

  canActivate(_ctx: ExecutionContext): boolean {
    const userId = this.cls.get<string>(CLS_USER_ID_KEY);
    if (!userId) {
      throw new UnauthorizedException('X-User-Id header is required');
    }
    return true;
  }
}
