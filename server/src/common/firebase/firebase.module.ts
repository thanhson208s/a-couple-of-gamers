import { Global, Module } from '@nestjs/common';
import * as admin from 'firebase-admin';

export const FIREBASE_AUTH = 'FIREBASE_AUTH';
export const FIREBASE_MSG = 'FIREBASE_MSG';

@Global()
@Module({
  providers: [
    {
      provide: FIREBASE_AUTH,
      useFactory: () => FirebaseModule.getFirebaseApp().auth()
    },
    {
      provide: FIREBASE_MSG,
      useFactory: () => FirebaseModule.getFirebaseApp().messaging()
    }
  ],
  exports: [FIREBASE_AUTH, FIREBASE_MSG]
})

export class FirebaseModule {
  static getFirebaseApp(): admin.app.App {
    if (admin.apps.length === 0)
      admin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID,
        credential: process.env.FIREBASE_SERVICE_ACCOUNT 
          ? admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
          : admin.credential.applicationDefault()
      });
    return admin.app();
  }
}