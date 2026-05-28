import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RefreshTokenDto } from './modules/auth/refresh-token.dto';
import { DevLoginDto } from './modules/dev/dev-login.dto';
import { MatchMessageDto } from './modules/matches/match-message.dto';
import { MatchesService } from './modules/matches/matches.service';
import { SubmitActionDto } from './modules/matches/submit-action.dto';
import { WS_DTO_METADATA } from './modules/ws/ws.decorators';

type DtoClass = new () => object;

describe('transport validation coverage', () => {
  const validationPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  async function validate(metatype: DtoClass, value: Record<string, unknown>) {
    const metadata: ArgumentMetadata = { type: 'body', metatype, data: '' };
    return validationPipe.transform(value, metadata);
  }

  it.each([
    [RefreshTokenDto, { refreshToken: 'refresh-token' }],
    [DevLoginDto, { accountId: 'dev-account' }],
    [MatchMessageDto, { matchId: 'match-1' }],
  ])('accepts valid %p payloads', async (metatype, payload) => {
    await expect(validate(metatype, payload)).resolves.toMatchObject(payload);
  });

  it.each([
    [RefreshTokenDto, { refreshToken: 'refresh-token', extra: true }],
    [DevLoginDto, { accountId: 'dev-account', extra: true }],
    [MatchMessageDto, { matchId: 'match-1', extra: true }],
  ])('rejects unknown properties for %p', async (metatype, payload) => {
    await expect(validate(metatype, payload)).rejects.toThrow();
  });

  it.each([
    [RefreshTokenDto, { refreshToken: '' }],
    [DevLoginDto, { accountId: '' }],
    [MatchMessageDto, { matchId: '' }],
  ])('rejects empty required string fields for %p', async (metatype, payload) => {
    await expect(validate(metatype, payload)).rejects.toThrow();
  });

  it('registers DTO validation for active WebSocket match message handlers', () => {
    const reflector = new Reflector();

    expect(reflector.get(WS_DTO_METADATA, MatchesService.prototype.onUserOpenMatch)).toBe(MatchMessageDto);
    expect(reflector.get(WS_DTO_METADATA, MatchesService.prototype.onUserCloseMatch)).toBe(MatchMessageDto);
    expect(reflector.get(WS_DTO_METADATA, MatchesService.prototype.onUserSubmitAction)).toBe(SubmitActionDto);
  });
});
