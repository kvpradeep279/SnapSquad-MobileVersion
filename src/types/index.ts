export type RootStackParamList = {
  Onboarding: undefined;
  Auth: undefined;
  SignUp: undefined;
  Main: undefined;
  Home: undefined;
  Upload: undefined;
  Processing: { albumId?: string } | undefined;
  Clusters: { albumId?: string } | undefined;
  ClusterDetail: { albumId: string; clusterLabel: number; displayName?: string } | undefined;
  Export: { albumId?: string } | undefined;
  Settings: undefined;
  EditProfile: undefined;
  People: undefined;
  PersonDetail: { personName: string };
};

