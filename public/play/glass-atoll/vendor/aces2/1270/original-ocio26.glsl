
// Declaration of all textures

uniform sampler2D aces2_1270_reach_m_table_0Sampler;
uniform sampler2D aces2_1270_gamut_cusp_table_0Sampler;

// Declaration of all helper methods

float aces2_1270_reach_m_table_0_sample(float h)
{
  float i_base = floor(h);
  float i_lo = i_base + float(1);
  float i_hi = i_lo + 1.0;
  float lo = texture(aces2_1270_reach_m_table_0Sampler, vec2((i_lo + 0.5) / float (363), 0.0)).r;
  float hi = texture(aces2_1270_reach_m_table_0Sampler, vec2((i_hi + 0.5) / float (363), 0.5)).r;
  float t = h - i_base;
  return mix(lo, hi, t);
}
float aces2_1270_tonescale_fwd0(float J)
{
  float A = 0.0323680267 * pow(abs(J) * 0.00999999978, 0.879464149);
  float Y = pow(( 27.1299992 * A) / (1.0f - A), 2.3809523809523809);
  float f = 12.9296789 * pow(Y / (Y + 5.669065437486438), 1.14999998);
  float Y_ts = max(0.0, f * f / (f + 0.0399999991));
  float F_L_Y = pow(0.79370057210326195 * Y_ts, 0.42);
  float J_ts = 100. * pow((F_L_Y / ( 27.1299992 + F_L_Y)) * 30.8946857, 1.13705599);
  return sign(J) * J_ts;
}
float aces2_1270_toe_fwd0(float x, float limit, float k1_in, float k2_in)
{
  float k2 = max(k2_in, 0.001);
  float k1 = sqrt(k1_in * k1_in + k2 * k2);
  float k3 = (limit + k1) / (limit + k2);
  return (x > limit) ? x : 0.5 * (k3 * x - k1 + sqrt((k3 * x - k1) * (k3 * x - k1) + 4.0 * k2 * k3 * x));
}
const float aces2_1270_gamut_cusp_table_0_hues_array[363] = float[363](-1.00183105, 0., 1.00298178, 2.00596356, 3.00894547, 4.01192713, 5.01490879, 6.01789093, 7.02087259, 8.02385426, 9.0268364, 10.0298176, 11.0327997, 12.0357819, 13.038763, 14.0417452, 15.0447264, 16.0477085, 17.0506897, 18.0536728, 19.056654, 20.0596352, 21.0626183, 22.0655994, 23.0685806, 24.0715637, 25.0745449, 26.0775261, 26.7123528, 27.7204685, 28.7285862, 29.736702, 30.7448177, 31.7529335, 32.7610512, 33.7691689, 34.7772827, 35.7854004, 36.7935181, 37.8016319, 38.8097496, 39.8178635, 40.8259811, 41.8340988, 42.8422165, 43.8503304, 44.858448, 45.8665619, 46.8746796, 47.8827972, 48.8909149, 49.8990288, 50.9071465, 51.9152603, 52.923378, 53.9314957, 54.9396133, 55.9477272, 56.9558411, 57.9639587, 58.9720764, 59.9801941, 60.988308, 61.9964256, 63.0045433, 64.0126572, 65.0207748, 66.0288925, 67.0370026, 68.0451202, 69.0532379, 70.0613556, 71.0694733, 72.0775909, 73.0857086, 74.0938263, 75.101944, 76.110054, 77.1181717, 78.1262817, 79.1343994, 80.1425171, 81.1506348, 82.1587524, 83.1668701, 84.1749878, 85.1831055, 86.1912231, 87.1993332, 88.2074509, 89.2155685, 90.2236786, 91.2317963, 92.2399139, 93.2480316, 94.2561493, 95.264267, 96.2723846, 97.2805023, 98.28862, 99.2967377, 100.30484, 101.312958, 102.321075, 103.329193, 104.337311, 105.345428, 106.353539, 106.70591, 107.711136, 108.71637, 109.721596, 110.726822, 111.732056, 112.737282, 113.742508, 114.747734, 115.752968, 116.758194, 117.76342, 118.768646, 119.77388, 120.779106, 121.784332, 122.789566, 123.794792, 124.800018, 125.805252, 126.810478, 127.815704, 128.820938, 129.826157, 130.83139, 131.836624, 132.841843, 133.847076, 134.85231, 135.857529, 136.862762, 137.867996, 138.873215, 139.878448, 140.96817, 142.057877, 143.147583, 144.237305, 145.327026, 146.416733, 147.410934, 148.405121, 149.399323, 150.393509, 151.387711, 152.381897, 153.376099, 154.370285, 155.364487, 156.358673, 157.352875, 158.347076, 159.341263, 160.335464, 161.329651, 162.323853, 163.318039, 164.312241, 165.306427, 166.300629, 167.294815, 168.289017, 169.283203, 170.277405, 171.271606, 172.265793, 173.259995, 174.254181, 175.248383, 176.242569, 177.236771, 178.230957, 179.225159, 180.21936, 181.213547, 182.207733, 183.201935, 184.196136, 185.190323, 186.184525, 187.178711, 188.172913, 189.167099, 190.161301, 191.155487, 192.149689, 193.051926, 193.954163, 194.856415, 195.758652, 196.757507, 197.756348, 198.755203, 199.754059, 200.752899, 201.751755, 202.750595, 203.749451, 204.748306, 205.747147, 206.746002, 207.744858, 208.743698, 209.742554, 210.741394, 211.74025, 212.739105, 213.737946, 214.736801, 215.735657, 216.734497, 217.733353, 218.732208, 219.731049, 220.729904, 221.72876, 222.7276, 223.726456, 224.725296, 225.724152, 226.723007, 227.721848, 228.720703, 229.719543, 230.718399, 231.717255, 232.716095, 233.714951, 234.713806, 235.712646, 236.711502, 237.710358, 238.709198, 239.708054, 240.706909, 241.70575, 242.704605, 243.703461, 244.702301, 245.701157, 246.699997, 247.698853, 248.697693, 249.696548, 250.695404, 251.694244, 252.6931, 253.691956, 254.690796, 255.689651, 256.688507, 257.687347, 258.686188, 259.685059, 260.683899, 261.682739, 262.68161, 263.68045, 264.679291, 265.678162, 266.677002, 267.690186, 268.7034, 269.716583, 270.729797, 271.742981, 272.756195, 273.769379, 274.782593, 275.795776, 276.797913, 277.800049, 278.802185, 279.804291, 280.806427, 281.808563, 282.810699, 283.812836, 284.814972, 285.817078, 286.819214, 287.82135, 288.823486, 289.825623, 290.827759, 291.829895, 292.832001, 293.834137, 294.836273, 295.838409, 296.840546, 297.842682, 298.844788, 299.846924, 300.84906, 301.851196, 302.853333, 303.855469, 304.857605, 305.859711, 306.861847, 307.863983, 308.866119, 309.868256, 310.870361, 311.872498, 312.874634, 313.87677, 314.878906, 315.881042, 316.883179, 317.885315, 318.887421, 319.889557, 320.891693, 321.893829, 322.895966, 323.898071, 324.900208, 325.902344, 326.90448, 327.906616, 328.908752, 329.910889, 330.912994, 331.915131, 332.917267, 333.92276, 334.928253, 335.933777, 336.93927, 337.944763, 338.950256, 339.95578, 340.961273, 341.966766, 342.968628, 343.970459, 344.97229, 345.974152, 346.976013, 347.977844, 348.979675, 349.981537, 350.983398, 351.985229, 352.987061, 353.988922, 354.990784, 355.992615, 356.994446, 357.996307, 358.998169, 360., 361.002991);
vec3 aces2_1270_gamut_cusp_table_0_sample(float h)
{
  int i = int(h) + 1;
  int i_lo = int(max(float(0), float(i + 0)));
  int i_hi = int(min(float(361), float(i + 2)));
  while (i_lo + 1 < i_hi)
  {
    float hcur = aces2_1270_gamut_cusp_table_0_hues_array[i];
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
  vec3 lo = texture(aces2_1270_gamut_cusp_table_0Sampler, vec2((float(i_hi) - 1.0 + 0.5) / float(363), 0.5)).rgb;
  vec3 hi = texture(aces2_1270_gamut_cusp_table_0Sampler, vec2((float(i_hi) + 0.5) / float(363), 0.5)).rgb;
  float t = (h - aces2_1270_gamut_cusp_table_0_hues_array[i_hi - 1]) / (aces2_1270_gamut_cusp_table_0_hues_array[i_hi] - aces2_1270_gamut_cusp_table_0_hues_array[i_hi - 1]);
  return mix(lo, hi, t);
}
float aces2_1270_get_focus_gain0(float J, float cuspJ)
{
  float thr = mix(cuspJ, 314.444122, 0.300000);
  if (J > thr)
  {
    float gain = ( 314.444122 - thr) / max(0.0001, 314.444122 - J);
    gain = log(gain)/log(10.0);
    return gain * gain + 1.0;
  }
  else
  {
    return 1.0;
  }
}
float aces2_1270_solve_J_intersect0(float J, float M, float focusJ, float slope_gain)
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
    float b = - (1.0 + M_scaled + 314.444122 * a);
    float c = 314.444122 * M_scaled + J;
    float det =  b * b - 4.f * a * c;
    float root =  sqrt(det);
    return -2.0 * c / (b - root);
  }
}
float aces2_1270_find_gamut_boundary_intersection0(vec2 JM_cusp, float gamma_top_inv, float gamma_bottom_inv, float J_intersect_source, float J_intersect_cusp, float slope)
{
  float M_boundary_lower = J_intersect_cusp * pow(J_intersect_source / J_intersect_cusp, gamma_bottom_inv) / (JM_cusp.r / JM_cusp.g - slope);
  float M_boundary_upper = JM_cusp.g * (314.444122 - J_intersect_cusp) * pow((314.444122 - J_intersect_source) / (314.444122 - J_intersect_cusp), gamma_top_inv) / (slope * JM_cusp.g + 314.444122 - JM_cusp.r);
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
float aces2_1270_remap_M_fwd0(float M, float gamut_boundary_M, float reach_boundary_M)
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
vec3 aces2_1270_gamut_compress0(vec3 JMh, float Jx, vec3 JMGcusp, float reachMaxM)
{
  float J = JMh.r;
  float M = JMh.g;
  float h = JMh.b;
  if (M <= 0.0 || J > 314.444122)
  {
    return vec3(J, 0.0, h);
  }
  else
  {
    vec2 JMcusp = JMGcusp.rg;
    float focusJ = mix(JMcusp.r, 41.444248, min(1.0, 1.300000 - (JMcusp.r / 314.444122)));
    float slope_gain = 1244.48694 * aces2_1270_get_focus_gain0(Jx, JMcusp.r);
    float J_intersect_source = aces2_1270_solve_J_intersect0(JMh.r, JMh.g, focusJ, slope_gain);
    float gamut_slope = (J_intersect_source < focusJ) ? J_intersect_source : (314.444122 - J_intersect_source);
    gamut_slope = gamut_slope * (J_intersect_source - focusJ) / (focusJ * slope_gain);
    float gamma_top_inv = JMGcusp.b;
    float gamma_bottom_inv = 0.821512997;
    float J_intersect_cusp = aces2_1270_solve_J_intersect0(JMcusp.r, JMcusp.g, focusJ, slope_gain);
    float gamutBoundaryM = aces2_1270_find_gamut_boundary_intersection0(JMcusp, gamma_top_inv, gamma_bottom_inv, J_intersect_source, J_intersect_cusp, gamut_slope);
    if (gamutBoundaryM <= 0.0)
    {
      return vec3(J, 0.0, h);
    }
    float reachBoundaryM = 314.444122 * pow(J_intersect_source / 314.444122,  0.879464149);
    reachBoundaryM = reachBoundaryM / ((314.444122 / reachMaxM) - gamut_slope);
    float remapped_M = aces2_1270_remap_M_fwd0(M, gamutBoundaryM, reachBoundaryM);
    float remapped_J = J_intersect_source + remapped_M * gamut_slope;
    return vec3(remapped_J, remapped_M, h);
  }
}

// Declaration of the OCIO shader function

vec4 aces2Display1270(vec4 inPixel)
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
    outColor.rgb = min(vec3(4414.884765625, 4414.884765625, 4414.884765625), outColor.rgb);
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
    
    float J_ts = aces2_1270_tonescale_fwd0(outColor.r);
    // Sample tables (fwd)
    float reachMaxM = aces2_1270_reach_m_table_0_sample(outColor.b);
    
    {
      float J = outColor.r;
      float M = outColor.g;
      float h = outColor.b;
      float M_cp = M;
      if (M != 0.0)
      {
        float nJ = J_ts / 314.444122;
        float snJ = max(0.0, 1.0 - nJ);
        float Mnorm;
        {
          float cos_hr2 = 2.0 * cos_hr * cos_hr - 1.0;
          float sin_hr2 = 2.0 * cos_hr * sin_hr;
          float cos_hr3 = 4.0 * cos_hr * cos_hr * cos_hr - 3.0 * cos_hr;
          float sin_hr3 = 3.0 * sin_hr - 4.0 * sin_hr * sin_hr * sin_hr;
          vec3 cosines = vec3(cos_hr, cos_hr2, cos_hr3);
          vec3 cosine_weights = vec3(30.70325250411987, 44.587253583354958, 21.344174099349974);
          vec3 sines = vec3(sin_hr, sin_hr2, sin_hr3);
          vec3 sine_weights = vec3(39.701631206302643, -17.251858236236572, 24.890364134902956);
          Mnorm = dot(cosines, cosine_weights) + dot(sines, sine_weights) + 208.81477844970703;
        }
        float limit = pow(nJ, 0.879464149) * reachMaxM / Mnorm;
        M_cp = M * pow(J_ts / J, 0.879464149);
        M_cp = M_cp / Mnorm;
        M_cp = limit - aces2_1270_toe_fwd0(limit - M_cp, limit - 0.001, snJ * 0.309888005, sqrt(nJ * nJ + 0.000393700786));
        M_cp = aces2_1270_toe_fwd0(M_cp, limit, nJ * 11.1421261, snJ);
        M_cp = M_cp * Mnorm;
      }
      outColor.rgb = vec3(J_ts, M_cp, h);
    }
    
    // Add GamutCompress (fwd)
    
    {
      vec3 JMGcusp = aces2_1270_gamut_cusp_table_0_sample(outColor.b);
      outColor.rgb = aces2_1270_gamut_compress0(outColor.rgb, outColor.r, JMGcusp, reachMaxM);
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
    outColor.rgb = min(vec3(12.699999999999999, 12.699999999999999, 12.699999999999999), outColor.rgb);
  }

  return outColor;
}
