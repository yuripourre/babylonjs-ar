/**
 * Mesh Reconstruction Module
 * Real-time 3D mesh reconstruction from depth maps
 */

export { SparseVoxelGrid } from './sparse-voxel-grid';
export type {
  Voxel,
  VoxelGridConfig,
} from './sparse-voxel-grid';

export { TSDFFusion } from './tsdf-fusion';
export type {
  TSDFFusionConfig,
} from './tsdf-fusion';

export { MarchingCubes } from './marching-cubes';
export type {
  MeshVertex,
  MeshTriangle,
  ExtractedMesh,
  MarchingCubesConfig,
} from './marching-cubes';

export { MeshReconstructor } from './mesh-reconstructor';
export type {
  MeshReconstructorConfig,
  ReconstructionStats,
} from './mesh-reconstructor';
