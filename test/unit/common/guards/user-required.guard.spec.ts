import { UnauthorizedException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { UserRequiredGuard } from '../../../../src/common/guards/user-required.guard';

const makeCls = (userId: string | undefined) =>
  ({ get: jest.fn().mockReturnValue(userId) }) as unknown as ClsService;

describe('UserRequiredGuard', () => {
  it('returns true when a userId is present in CLS', () => {
    const guard = new UserRequiredGuard(makeCls('00000000-0000-4000-8000-000000000000'));
    expect(guard.canActivate({} as any)).toBe(true);
  });

  it('throws UnauthorizedException when userId is missing', () => {
    const guard = new UserRequiredGuard(makeCls(undefined));
    expect(() => guard.canActivate({} as any)).toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when userId is an empty string', () => {
    const guard = new UserRequiredGuard(makeCls(''));
    expect(() => guard.canActivate({} as any)).toThrow(UnauthorizedException);
  });
});
