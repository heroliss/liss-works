
// Declaration of all textures

uniform sampler2D aces2_700_reach_m_table_0Sampler;
uniform sampler2D aces2_700_gamut_cusp_table_0Sampler;

// Declaration of all helper methods

float aces2_700_reach_m_table_0_sample(float h)
{
  float i_base = floor(h);
  float i_lo = i_base + float(1);
  float i_hi = i_lo + 1.0;
  float lo = texture(aces2_700_reach_m_table_0Sampler, vec2((i_lo + 0.5) / float (363), 0.0)).r;
  float hi = texture(aces2_700_reach_m_table_0Sampler, vec2((i_hi + 0.5) / float (363), 0.5)).r;
  float t = h - i_base;
  return mix(lo, hi, t);
}
float aces2_700_tonescale_fwd0(float J)
{
  float A = 0.0323680267 * pow(abs(J) * 0.00999999978, 0.879464149);
  float Y = pow(( 27.1299992 * A) / (1.0f - A), 2.3809523809523809);
  float f = 7.11912203 * pow(Y / (Y + 3.5176529351386421), 1.14999998);
  float Y_ts = max(0.0, f * f / (f + 0.0399999991));
  float F_L_Y = pow(0.79370057210326195 * Y_ts, 0.42);
  float J_ts = 100. * pow((F_L_Y / ( 27.1299992 + F_L_Y)) * 30.8946857, 1.13705599);
  return sign(J) * J_ts;
}
float aces2_700_toe_fwd0(float x, float limit, float k1_in, float k2_in)
{
  float k2 = max(k2_in, 0.001);
  float k1 = sqrt(k1_in * k1_in + k2 * k2);
  float k3 = (limit + k1) / (limit + k2);
  return (x > limit) ? x : 0.5 * (k3 * x - k1 + sqrt((k3 * x - k1) * (k3 * x - k1) + 4.0 * k2 * k3 * x));
}
const float aces2_700_gamut_cusp_table_0_hues_array[363] = float[363](-1.00720215, 0., 0.988923073, 1.97784615, 2.96676922, 3.95569229, 4.94461536, 5.93353844, 6.92246151, 7.91138458, 8.90030766, 9.88923073, 10.8781538, 11.8670769, 12.8559999, 13.844923, 14.8338461, 15.8227692, 16.8116913, 17.8006153, 18.7895393, 19.7784615, 20.7673836, 21.7563076, 22.7452316, 23.7341537, 24.7230759, 25.7119999, 26.5581589, 27.5671425, 28.5761261, 29.5851097, 30.5940933, 31.6030769, 32.6120605, 33.6210442, 34.6300278, 35.6390114, 36.647995, 37.6569786, 38.6659622, 39.674942, 40.6839294, 41.6929092, 42.7018967, 43.7108765, 44.7198639, 45.7288437, 46.7378311, 47.7468109, 48.7557983, 49.7647781, 50.7737617, 51.7827454, 52.791729, 53.8007126, 54.8096962, 55.8186798, 56.8276634, 57.836647, 58.8456306, 59.8546143, 60.8635979, 61.8725815, 62.8815651, 63.8905487, 64.8995361, 65.9085159, 66.9174957, 67.9264832, 68.9354706, 69.9444504, 70.9534302, 71.9624176, 72.971405, 73.9803848, 74.9893646, 75.9983521, 77.0073318, 78.0163116, 79.0252991, 80.0342865, 81.0432663, 82.0522461, 83.0612335, 84.0702209, 85.0792007, 86.0881805, 87.097168, 88.1061554, 89.1151352, 90.124115, 91.1331024, 92.1420822, 93.1510696, 94.1600494, 95.1690369, 96.1780167, 97.1870041, 98.1959839, 99.2049713, 100.213951, 101.222939, 102.231918, 103.240906, 104.249886, 105.258873, 106.267853, 106.654793, 107.665771, 108.67675, 109.687729, 110.698708, 111.709686, 112.720665, 113.731644, 114.74263, 115.753601, 116.764587, 117.775566, 118.786545, 119.797523, 120.808502, 121.819481, 122.83046, 123.841438, 124.852417, 125.863396, 126.874374, 127.885353, 128.896332, 129.907318, 130.918289, 131.929276, 132.940247, 133.951233, 134.962204, 135.97319, 136.984161, 137.995148, 139.006134, 140.017105, 140.96846, 141.919815, 142.87117, 143.82251, 144.773865, 145.72522, 146.676575, 147.687637, 148.6987, 149.709778, 150.72084, 151.731903, 152.742966, 153.754028, 154.765091, 155.776169, 156.787231, 157.798294, 158.809357, 159.820419, 160.831482, 161.84256, 162.853622, 163.864685, 164.875748, 165.88681, 166.897888, 167.908951, 168.920013, 169.931076, 170.942139, 171.953217, 172.964279, 173.975342, 174.986404, 175.997467, 177.00853, 178.019608, 179.03067, 180.041733, 181.052795, 182.063858, 183.074921, 184.085999, 185.097061, 186.108124, 187.119186, 188.130249, 189.141327, 190.15239, 191.163452, 192.174515, 193.075851, 193.977173, 194.87851, 195.779846, 196.785675, 197.791504, 198.797333, 199.803162, 200.809006, 201.814835, 202.820663, 203.826492, 204.832321, 205.83815, 206.843979, 207.849808, 208.855637, 209.861481, 210.86731, 211.873138, 212.878967, 213.884796, 214.890625, 215.896454, 216.902283, 217.908112, 218.91394, 219.919785, 220.925613, 221.931442, 222.937271, 223.9431, 224.948929, 225.954758, 226.960587, 227.966431, 228.97226, 229.978088, 230.983917, 231.989746, 232.995575, 234.001404, 235.007233, 236.013062, 237.01889, 238.024719, 239.030563, 240.036392, 241.042221, 242.04805, 243.053879, 244.059708, 245.065536, 246.071381, 247.077209, 248.083038, 249.088867, 250.094696, 251.100525, 252.106354, 253.112183, 254.118011, 255.12384, 256.129669, 257.135498, 258.141327, 259.147156, 260.153015, 261.158813, 262.164673, 263.170502, 264.176331, 265.182159, 266.187988, 267.193817, 268.166687, 269.139557, 270.112457, 271.085327, 272.058197, 273.031067, 274.003967, 274.976837, 275.949707, 276.947449, 277.945221, 278.942963, 279.940735, 280.938477, 281.936249, 282.93399, 283.931763, 284.929504, 285.927246, 286.925018, 287.92276, 288.920532, 289.918274, 290.916046, 291.913788, 292.91156, 293.909302, 294.907043, 295.904816, 296.902557, 297.90033, 298.898071, 299.895844, 300.893585, 301.891327, 302.889099, 303.886841, 304.884613, 305.882355, 306.880127, 307.877869, 308.87561, 309.873383, 310.871124, 311.868896, 312.866638, 313.86441, 314.862152, 315.859924, 316.857666, 317.855408, 318.85318, 319.850922, 320.848694, 321.846436, 322.844208, 323.841949, 324.839722, 325.837463, 326.835205, 327.832977, 328.830719, 329.828491, 330.826233, 331.824005, 332.821747, 333.827118, 334.832489, 335.83786, 336.843231, 337.848602, 338.853973, 339.859344, 340.864716, 341.870087, 342.877319, 343.884521, 344.891724, 345.898956, 346.906189, 347.913391, 348.920593, 349.927826, 350.935059, 351.942261, 352.949463, 353.956696, 354.963928, 355.97113, 356.978333, 357.985565, 358.992798, 360., 360.988922);
vec3 aces2_700_gamut_cusp_table_0_sample(float h)
{
  int i = int(h) + 1;
  int i_lo = int(max(float(0), float(i + 0)));
  int i_hi = int(min(float(361), float(i + 2)));
  while (i_lo + 1 < i_hi)
  {
    float hcur = aces2_700_gamut_cusp_table_0_hues_array[i];
    if (h > hcur)
    {
      i_lo = i;
    }
    else
    {
      i_hi = i;
    }
    i = (i_lo + i_hi) / 2;
  }
  vec3 lo = texture(aces2_700_gamut_cusp_table_0Sampler, vec2((float(i_hi) - 1.0 + 0.5) / float(363), 0.5)).rgb;
  vec3 hi = texture(aces2_700_gamut_cusp_table_0Sampler, vec2((float(i_hi) + 0.5) / float(363), 0.5)).rgb;
  float t = (h - aces2_700_gamut_cusp_table_0_hues_array[i_hi - 1]) / (aces2_700_gamut_cusp_table_0_hues_array[i_hi] - aces2_700_gamut_cusp_table_0_hues_array[i_hi - 1]);
  return mix(lo, hi, t);
}
float aces2_700_get_focus_gain0(float J, float cuspJ)
{
  float thr = mix(cuspJ, 241.981171, 0.300000);
  if (J > thr)
  {
    float gain = ( 241.981171 - thr) / max(0.0001, 241.981171 - J);
    gain = log(gain)/log(10.0);
    return gain * gain + 1.0;
  }
  else
  {
    return 1.0;
  }
}
float aces2_700_solve_J_intersect0(float J, float M, float focusJ, float slope_gain)
{
  float M_scaled = M / slope_gain;
  float a = M_scaled / focusJ;
  if (J < focusJ)
  {
    float b = 1.0 - M_scaled;
    float c = -J;
    float det =  b * b - 4.f * a * c;
    float root =  sqrt(det);
    return -2.0 * c / (b + root);
  }
  else
  {
    float b = - (1.0 + M_scaled + 241.981171 * a);
    float c = 241.981171 * M_scaled + J;
    float det =  b * b - 4.f * a * c;
    float root =  sqrt(det);
    return -2.0 * c / (b - root);
  }
}
float aces2_700_find_gamut_boundary_intersection0(vec2 JM_cusp, float gamma_top_inv, float gamma_bottom_inv, float J_intersect_source, float J_intersect_cusp, float slope)
{
  float M_boundary_lower = J_intersect_cusp * pow(J_intersect_source / J_intersect_cusp, gamma_bottom_inv) / (JM_cusp.r / JM_cusp.g - slope);
  float M_boundary_upper = JM_cusp.g * (241.981171 - J_intersect_cusp) * pow((241.981171 - J_intersect_source) / (241.981171 - J_intersect_cusp), gamma_top_inv) / (slope * JM_cusp.g + 241.981171 - JM_cusp.r);
  float smin = 0.0;
  {
    float a = M_boundary_lower;
    float b = M_boundary_upper;
    float s = 0.119999997 * JM_cusp.g;
    float h = max(s - abs(a - b), 0.0) / s;
    smin = min(a, b) - h * h * h * s * 0.16666666666666666;
  }
  return smin;
}
float aces2_700_remap_M_fwd0(float M, float gamut_boundary_M, float reach_boundary_M)
{
  float boundary_ratio = gamut_boundary_M / reach_boundary_M;
  float proportion = max(boundary_ratio, 0.75);
  float threshold = proportion * gamut_boundary_M;
  if (proportion >= 1.0f || M <= threshold)
  {
    return M;
  }
  float m_offset = M - threshold;
  float gamut_offset = gamut_boundary_M - threshold;
  float reach_offset = reach_boundary_M - threshold;
  float scale = reach_offset / ((reach_offset / gamut_offset) - 1.0f);
  float nd = m_offset / scale;
  return threshold + scale * nd / (1.0f + nd);
}
vec3 aces2_700_gamut_compress0(vec3 JMh, float Jx, vec3 JMGcusp, float reachMaxM)
{
  float J = JMh.r;
  float M = JMh.g;
  float h = JMh.b;
  if (M <= 0.0 || J > 241.981171)
  {
    return vec3(J, 0.0, h);
  }
  else
  {
    vec2 JMcusp = JMGcusp.rg;
    float focusJ = mix(JMcusp.r, 39.859745, min(1.0, 1.300000 - (JMcusp.r / 241.981171)));
    float slope_gain = 809.800659 * aces2_700_get_focus_gain0(Jx, JMcusp.r);
    float J_intersect_source = aces2_700_solve_J_intersect0(JMh.r, JMh.g, focusJ, slope_gain);
    float gamut_slope = (J_intersect_source < focusJ) ? J_intersect_source : (241.981171 - J_intersect_source);
    gamut_slope = gamut_slope * (J_intersect_source - focusJ) / (focusJ * slope_gain);
    float gamma_top_inv = JMGcusp.b;
    float gamma_bottom_inv = 0.833919227;
    float J_intersect_cusp = aces2_700_solve_J_intersect0(JMcusp.r, JMcusp.g, focusJ, slope_gain);
    float gamutBoundaryM = aces2_700_find_gamut_boundary_intersection0(JMcusp, gamma_top_inv, gamma_bottom_inv, J_intersect_source, J_intersect_cusp, gamut_slope);
    if (gamutBoundaryM <= 0.0)
    {
      return vec3(J, 0.0, h);
    }
    float reachBoundaryM = 241.981171 * pow(J_intersect_source / 241.981171,  0.879464149);
    reachBoundaryM = reachBoundaryM / ((241.981171 / reachMaxM) - gamut_slope);
    float remapped_M = aces2_700_remap_M_fwd0(M, gamutBoundaryM, reachBoundaryM);
    float remapped_J = J_intersect_source + remapped_M * gamut_slope;
    return vec3(remapped_J, remapped_M, h);
  }
}

// Declaration of the OCIO shader function

vec4 aces2Display700(vec4 inPixel)
{
  vec4 outColor = inPixel;
  
  // Add Matrix processing
  
  {
    vec4 res = vec4(outColor.rgb.r, outColor.rgb.g, outColor.rgb.b, outColor.a);
    vec4 tmp = res;
    res = mat4(0.61309740240118782, 0.070193722469581873, 0.020615592882226925, 0., 0.3395231461841059, 0.91635387905734356, 0.10956977293813538, 0., 0.047379451414706591, 0.013452398473074128, 0.86981463417963734, 0., 0., 0., 0., 1.) * tmp;
    outColor.rgb = vec3(res.x, res.y, res.z);
    outColor.a = res.w;
  }
  
  // Add Range processing
  
  {
    outColor.rgb = max(vec3(0., 0., 0.), outColor.rgb);
    outColor.rgb = min(vec3(3620.141357421875, 3620.141357421875, 3620.141357421875), outColor.rgb);
  }
  
  // Add Matrix processing
  
  {
    vec4 res = vec4(outColor.rgb.r, outColor.rgb.g, outColor.rgb.b, outColor.a);
    vec4 tmp = res;
    res = mat4(0.69545224135745187, 0.044794563372037716, -0.0055258825581135443, 0., 0.14067869647029416, 0.85967111845642163, 0.0040252103059786595, 0., 0.16386906217225405, 0.0955343181715404, 1.0015006722521349, 0., 0., 0., 0., 1.) * tmp;
    outColor.rgb = vec3(res.x, res.y, res.z);
    outColor.a = res.w;
  }
  
  // Add FixedFunction 'ACES_OutputTransform20 (Forward)' processing
  
  {
    
    // Add RGB to JMh
    
    vec3 JMh;
    vec3 Aab;
    {
      {
        vec3 lms = mat3(0.445181042, 0.123734146, 0.0117007261, 0.34964928, 0.613643706, 0.0280607939, -0.00112973212, 0.0563228019, 0.753939033) * outColor.rgb;
        vec3 F_L_v = pow(abs(lms), vec3(0.419999987, 0.419999987, 0.419999987));
        vec3 rgb_a = (sign(lms) * F_L_v) / ( 27.1299992 + F_L_v);
        Aab = mat3(20.25881, 15480., 1720., 10.129405, -16887.2734, 1720., 0.506470263, 1407.27271, -3440.) * rgb_a.rgb;
      }
      {
        if (Aab.r <= 0.0)
        {
          JMh.rgb = vec3(0., 0., 0.);
        }
        else
        {
          float J = 100. * pow(Aab.r, 1.13705599);
          float M = (J == 0.0) ? 0.0 : sqrt(Aab.g * Aab.g + Aab.b * Aab.b);
          float h = (Aab.g == 0.0) ? 0.0 : atan(Aab.b, Aab.g) * 57.29577951308238;
          h = h - floor(h / 360.0) * 360.0;
          h = (h < 0.0) ? h + 360.0 : h;
          JMh.rgb = vec3(J, M, h);
        }
      }
      outColor.rgb = JMh;
    }
    float h_rad = outColor.b * 0.0174532924;
    float cos_hr = cos(h_rad);
    float sin_hr = sin(h_rad);
    
    // Add ToneScale and ChromaCompress (fwd)
    
    float J_ts = aces2_700_tonescale_fwd0(outColor.r);
    // Sample tables (fwd)
    float reachMaxM = aces2_700_reach_m_table_0_sample(outColor.b);
    
    {
      float J = outColor.r;
      float M = outColor.g;
      float h = outColor.b;
      float M_cp = M;
      if (M != 0.0)
      {
        float nJ = J_ts / 241.981171;
        float snJ = max(0.0, 1.0 - nJ);
        float Mnorm;
        {
          float cos_hr2 = 2.0 * cos_hr * cos_hr - 1.0;
          float sin_hr2 = 2.0 * cos_hr * sin_hr;
          float cos_hr3 = 4.0 * cos_hr * cos_hr * cos_hr - 3.0 * cos_hr;
          float sin_hr3 = 3.0 * sin_hr - 4.0 * sin_hr * sin_hr * sin_hr;
          vec3 cosines = vec3(cos_hr, cos_hr2, cos_hr3);
          vec3 cosine_weights = vec3(24.734840291461943, 35.919927254326346, 17.195075258874894);
          vec3 sines = vec3(sin_hr, sin_hr2, sin_hr3);
          vec3 sine_weights = vec3(31.984022118394375, -13.898265603847502, 20.051920609731674);
          Mnorm = dot(cosines, cosine_weights) + dot(sines, sine_weights) + 168.22322634246828;
        }
        float limit = pow(nJ, 0.879464149) * reachMaxM / Mnorm;
        M_cp = M * pow(J_ts / J, 0.879464149);
        M_cp = M_cp / Mnorm;
        M_cp = limit - aces2_700_toe_fwd0(limit - M_cp, limit - 0.001, snJ * 0.541947067, sqrt(nJ * nJ + 0.000714285707));
        M_cp = aces2_700_toe_fwd0(M_cp, limit, nJ * 9.09317589, snJ);
        M_cp = M_cp * Mnorm;
      }
      outColor.rgb = vec3(J_ts, M_cp, h);
    }
    
    // Add GamutCompress (fwd)
    
    {
      vec3 JMGcusp = aces2_700_gamut_cusp_table_0_sample(outColor.b);
      outColor.rgb = aces2_700_gamut_compress0(outColor.rgb, outColor.r, JMGcusp, reachMaxM);
    }
    
    // Add JMh to RGB
    
    {
      vec3 JMh = outColor.rgb;
      vec3 Aab;
      {
        Aab.r = pow(JMh.r * 0.00999999978, 0.879464149);
        Aab.g = JMh.g * cos_hr;
        Aab.b = JMh.g * sin_hr;
      }
      {
        vec3 rgb_a = mat3(0.0323680267, 0.0323680267, 0.0323680267, 2.07657631e-05, -4.10250432e-05, -1.01296409e-05, 1.3260621e-05, -1.20174373e-05, -0.000290076074) * Aab.rgb;
        vec3 rgb_a_lim = min( abs(rgb_a), vec3(0.99000001, 0.99000001, 0.99000001) );
        vec3 lms = sign(rgb_a) * pow( 27.1299992 * rgb_a_lim / (1.0f - rgb_a_lim), vec3(2.38095236, 2.38095236, 2.38095236));
        JMh.rgb = mat3(7.45048571, -1.4750675, 0.0106288502, -6.1301837, 3.11835742, -0.31857267, -0.0603808537, -0.383369029, 1.56786489) * lms;
      }
      outColor.rgb = JMh;
    }
  }
  
  // Add Range processing
  
  {
    outColor.rgb = max(vec3(0., 0., 0.), outColor.rgb);
    outColor.rgb = min(vec3(7., 7., 7.), outColor.rgb);
  }

  return outColor;
}
