export type RootStackParamList = {
  Onboarding: undefined;
  Auth: undefined;
  Main: undefined;
  Home: undefined;
  UploadHub: undefined;
  Upload: { roomId?: string } | undefined;
  Processing: { albumId?: string } | undefined;
  Clusters: { albumId?: string } | undefined;
  ClusterDetail: { albumId: string, clusterLabel: number, displayName?: string };
  Settings: undefined;
  EditProfile: undefined;
  People: undefined;
  PersonDetail: { personName: string };
  // V2 Room screens
  RoomQR: { roomId: string; roomName: string; qrPayload: string; showTimer?: boolean };
  RoomJoin: { roomId?: string } | undefined;
  PendingRequests: { roomId: string; roomName: string };
  Rooms: undefined;
  RoomDetail: { roomId: string; roomName: string };
  FindMe: { roomId: string; roomName: string };
};
