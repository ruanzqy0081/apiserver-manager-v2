import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { createDylibBuild, getDylibBuildsByOwner, getDylibBuildsByPackage, getPackageById, logActivity } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import fs from "fs/promises";
import path from "path";

function generateDylibContent(pkg: { name: string; token: string; version: string }): string {
  return `
// ============================================================
// API Server Dylib — Free Fire Bypass & Hooking Version
// Package: ${pkg.name}
// Version: ${pkg.version}
// Token: ${pkg.token}
// Generated: ${new Date().toISOString()}
// ============================================================
#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>
#import <objc/runtime.h>

static NSString *const kAPIToken = @"${pkg.token}";
static NSString *const kAPIEndpoint = @"https://apiserver-manager-v2-production.up.railway.app/api/trpc";
static NSString *const kGeneratorURL = @"https://apiserver-manager-v2-production.up.railway.app/gerador.html";

@interface APIServerUI : UIViewController <UITextFieldDelegate>
@property (nonatomic, strong) UIView *containerView;
@property (nonatomic, strong) UILabel *titleLabel;
@property (nonatomic, strong) UILabel *statusLabel;
@property (nonatomic, strong) UITextField *udidField;
@property (nonatomic, strong) UITextField *keyField;
@property (nonatomic, strong) UIButton *actionButton;
@property (nonatomic, strong) UIButton *generateButton;
@property (nonatomic, strong) NSString *currentUDID;
@property (nonatomic, strong) NSString *currentKey;
@property (nonatomic, assign) int daysRemaining;
@property (nonatomic, assign) BOOL isRegistering;
@property (nonatomic, assign) BOOL isValidatingKey;
- (void)callAPI:(NSString *)method data:(NSDictionary *)data completion:(void(^)(NSDictionary *, NSError *))completion;
@end

@interface APIServerSDK : NSObject
+ (instancetype)sharedInstance;
- (void)initialize;
- (void)showUI;
@end

@implementation APIServerUI
- (void)viewDidLoad {
    [super viewDidLoad];
    [self setupUI];
    [self checkStatus];
}

- (void)setupUI {
    self.view.backgroundColor = [[UIColor blackColor] colorWithAlphaComponent:0.7];
    
    CGFloat width = self.view.frame.size.width * 0.85;
    if (width > 350) width = 350;
    
    self.containerView = [[UIView alloc] initWithFrame:CGRectMake(0, 0, width, 420)];
    self.containerView.center = self.view.center;
    self.containerView.backgroundColor = [UIColor colorWithRed:0.10 green:0.10 blue:0.12 alpha:1.0];
    self.containerView.layer.cornerRadius = 20;
    self.containerView.layer.borderWidth = 2.0;
    self.containerView.layer.borderColor = [UIColor colorWithRed:0.0 green:0.47 blue:1.0 alpha:1.0].CGColor;
    [self.view addSubview:self.containerView];
    
    self.titleLabel = [[UILabel alloc] initWithFrame:CGRectMake(10, 15, width-20, 30)];
    self.titleLabel.text = @"${pkg.name}";
    self.titleLabel.textColor = [UIColor whiteColor];
    self.titleLabel.textAlignment = NSTextAlignmentCenter;
    self.titleLabel.font = [UIFont boldSystemFontOfSize:20];
    [self.containerView addSubview:self.titleLabel];
    
    self.statusLabel = [[UILabel alloc] initWithFrame:CGRectMake(15, 50, width-30, 60)];
    self.statusLabel.text = @"Verificando dispositivo...";
    self.statusLabel.textColor = [UIColor colorWithRed:0.7 green:0.7 blue:0.7 alpha:1.0];
    self.statusLabel.textAlignment = NSTextAlignmentCenter;
    self.statusLabel.numberOfLines = 0;
    self.statusLabel.font = [UIFont systemFontOfSize:13];
    [self.containerView addSubview:self.statusLabel];
    
    self.udidField = [[UITextField alloc] initWithFrame:CGRectMake(15, 120, width-30, 45)];
    self.udidField.placeholder = @"Cole seu UDID aqui";
    self.udidField.backgroundColor = [UIColor colorWithRed:0.15 green:0.15 blue:0.18 alpha:1.0];
    self.udidField.textColor = [UIColor whiteColor];
    self.udidField.layer.cornerRadius = 8;
    self.udidField.textAlignment = NSTextAlignmentCenter;
    self.udidField.font = [UIFont systemFontOfSize:11];
    self.udidField.hidden = YES;
    self.udidField.delegate = self;
    self.udidField.attributedPlaceholder = [[NSAttributedString alloc] initWithString:self.udidField.placeholder attributes:@{NSForegroundColorAttributeName: [UIColor grayColor]}];
    [self.containerView addSubview:self.udidField];
    
    self.keyField = [[UITextField alloc] initWithFrame:CGRectMake(15, 120, width-30, 45)];
    self.keyField.placeholder = @"Digite sua KEY aqui";
    self.keyField.backgroundColor = [UIColor colorWithRed:0.15 green:0.15 blue:0.18 alpha:1.0];
    self.keyField.textColor = [UIColor whiteColor];
    self.keyField.layer.cornerRadius = 8;
    self.keyField.textAlignment = NSTextAlignmentCenter;
    self.keyField.font = [UIFont systemFontOfSize:11];
    self.keyField.hidden = YES;
    self.keyField.delegate = self;
    self.keyField.attributedPlaceholder = [[NSAttributedString alloc] initWithString:self.keyField.placeholder attributes:@{NSForegroundColorAttributeName: [UIColor grayColor]}];
    [self.containerView addSubview:self.keyField];
    
    self.generateButton = [UIButton buttonWithType:UIButtonTypeSystem];
    self.generateButton.frame = CGRectMake(15, 175, width-30, 40);
    self.generateButton.backgroundColor = [UIColor colorWithRed:0.2 green:0.2 blue:0.25 alpha:1.0];
    self.generateButton.layer.cornerRadius = 8;
    [self.generateButton setTitleColor:[UIColor colorWithRed:0.0 green:0.47 blue:1.0 alpha:1.0] forState:0];
    self.generateButton.titleLabel.font = [UIFont boldSystemFontOfSize:14];
    [self.generateButton setTitle:@"GERAR NOVO UDID" forState:0];
    [self.generateButton addTarget:self action:@selector(openGeneratorURL) forControlEvents:UIControlEventTouchUpInside];
    self.generateButton.hidden = YES;
    [self.containerView addSubview:self.generateButton];
    
    self.actionButton = [UIButton buttonWithType:UIButtonTypeSystem];
    self.actionButton.frame = CGRectMake(15, 230, width-30, 50);
    self.actionButton.backgroundColor = [UIColor colorWithRed:0.0 green:0.47 blue:1.0 alpha:1.0];
    self.actionButton.layer.cornerRadius = 10;
    [self.actionButton setTitleColor:[UIColor whiteColor] forState:0];
    self.actionButton.titleLabel.font = [UIFont boldSystemFontOfSize:16];
    [self.actionButton addTarget:self action:@selector(handleAction) forControlEvents:UIControlEventTouchUpInside];
    [self.containerView addSubview:self.actionButton];
    
    [self updateButtonState:@"AGUARDE..." enabled:NO];
}

- (void)updateButtonState:(NSString *)title enabled:(BOOL)enabled {
    [self.actionButton setTitle:title forState:0];
    self.actionButton.enabled = enabled;
    self.actionButton.alpha = enabled ? 1.0 : 0.5;
}

- (void)checkStatus {
    // Carregar UDID salvo
    self.currentUDID = [[NSUserDefaults standardUserDefaults] stringForKey:@"com.apiserver.udid"];
    self.currentKey = [[NSUserDefaults standardUserDefaults] stringForKey:@"com.apiserver.key"];
    
    if (self.currentUDID && self.currentKey) {
        // UDID e KEY já existem - validar ambos
        [self updateButtonState:@"VALIDANDO..." enabled:NO];
        [self validateExistingUDIDAndKey];
    } else if (self.currentUDID) {
        // UDID existe mas KEY não - pedir KEY
        [self showKeyInputState];
    } else {
        // Nenhum UDID - pedir para gerar/colar
        [self showUDIDInputState];
    }
}

- (void)showUDIDInputState {
    self.statusLabel.text = @"Nenhum UDID registrado.\\nClique em 'GERAR NOVO UDID' para criar um.";
    self.statusLabel.textColor = [UIColor colorWithRed:0.7 green:0.7 blue:0.7 alpha:1.0];
    self.udidField.hidden = NO;
    self.generateButton.hidden = NO;
    self.keyField.hidden = YES;
    [self updateButtonState:@"REGISTRAR UDID" enabled:YES];
    self.isRegistering = YES;
    self.isValidatingKey = NO;
}

- (void)showKeyInputState {
    self.statusLabel.text = [NSString stringWithFormat:@"UDID: %@\\n\\nDigite sua KEY para continuar.", [self.currentUDID substringToIndex:8]];
    self.statusLabel.textColor = [UIColor colorWithRed:0.7 green:0.7 blue:0.7 alpha:1.0];
    self.udidField.hidden = YES;
    self.generateButton.hidden = YES;
    self.keyField.hidden = NO;
    [self updateButtonState:@"VALIDAR KEY" enabled:YES];
    self.isRegistering = NO;
    self.isValidatingKey = YES;
}

- (void)openGeneratorURL {
    NSURL *url = [NSURL URLWithString:kGeneratorURL];
    [[UIApplication sharedApplication] openURL:url options:@{} completionHandler:nil];
}

- (void)handleAction {
    if (self.isRegistering) {
        [self registerDevice];
    } else if (self.isValidatingKey) {
        [self validateKey];
    }
}

- (void)registerDevice {
    NSString *udid = self.udidField.text;
    if (udid.length < 10) {
        self.statusLabel.text = @"UDID inválido. Gere um novo.";
        self.statusLabel.textColor = [UIColor redColor];
        return;
    }
    
    [self updateButtonState:@"REGISTRANDO..." enabled:NO];
    self.currentUDID = udid;
    
    NSDictionary *json = @{@"json": @{@"token": kAPIToken, @"udid": self.currentUDID, @"name": @"iOS Device"}};
    [self callAPI:@"publicApi.registerDevice" data:json completion:^(NSDictionary *result, NSError *error) {
        dispatch_async(dispatch_get_main_queue(), ^{
            if (error) {
                self.statusLabel.text = @"Erro ao registrar. Tente novamente.";
                self.statusLabel.textColor = [UIColor redColor];
                [self updateButtonState:@"TENTAR NOVAMENTE" enabled:YES];
            } else {
                [[NSUserDefaults standardUserDefaults] setObject:self.currentUDID forKey:@"com.apiserver.udid"];
                [[NSUserDefaults standardUserDefaults] synchronize];
                [self showKeyInputState];
            }
        });
    }];
}

- (void)validateKey {
    NSString *key = self.keyField.text;
    if (key.length < 4) {
        self.statusLabel.text = @"KEY inválida.";
        self.statusLabel.textColor = [UIColor redColor];
        return;
    }
    
    [self updateButtonState:@"VALIDANDO..." enabled:NO];
    self.currentKey = key;
    
    NSDictionary *json = @{@"json": @{@"token": kAPIToken, @"udid": self.currentUDID, @"key": key}};
    [self callAPI:@"publicApi.validateKey" data:json completion:^(NSDictionary *result, NSError *error) {
        dispatch_async(dispatch_get_main_queue(), ^{
            if (error) {
                self.statusLabel.text = @"Erro na conexão.";
                self.statusLabel.textColor = [UIColor redColor];
                [self updateButtonState:@"TENTAR NOVAMENTE" enabled:YES];
                return;
            }
            
            NSDictionary *data = result[@"result"][@"data"][@"json"];
            if (!data) data = result[@"result"][@"data"];
            
            BOOL valid = [data[@"valid"] boolValue];
            if (valid) {
                [[NSUserDefaults standardUserDefaults] setObject:key forKey:@"com.apiserver.key"];
                [[NSUserDefaults standardUserDefaults] synchronize];
                
                self.daysRemaining = [data[@"daysRemaining"] intValue];
                NSString *packageName = data[@"packageName"] ?: @"Pacote";
                
                self.statusLabel.textColor = [UIColor colorWithRed:0.0 green:1.0 blue:0.0 alpha:1.0];
                self.statusLabel.text = [NSString stringWithFormat:@"✓ ACESSO LIBERADO!\\n\\nPacote: %@\\nDias: %d", packageName, self.daysRemaining];
                
                dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(2.0 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
                    [self dismissViewControllerAnimated:YES completion:nil];
                });
            } else {
                self.statusLabel.text = @"KEY expirada ou inválida.";
                self.statusLabel.textColor = [UIColor redColor];
                [self updateButtonState:@"TENTAR NOVAMENTE" enabled:YES];
            }
        });
    }];
}

- (void)validateExistingUDIDAndKey {
    NSDictionary *json = @{@"json": @{@"token": kAPIToken, @"udid": self.currentUDID, @"key": self.currentKey}};
    [self callAPI:@"publicApi.validateKey" data:json completion:^(NSDictionary *result, NSError *error) {
        dispatch_async(dispatch_get_main_queue(), ^{
            if (error) {
                self.statusLabel.text = @"Erro na validação. Tente novamente.";
                self.statusLabel.textColor = [UIColor redColor];
                [self updateButtonState:@"TENTAR NOVAMENTE" enabled:YES];
                return;
            }
            
            NSDictionary *data = result[@"result"][@"data"][@"json"];
            if (!data) data = result[@"result"][@"data"];
            
            BOOL valid = [data[@"valid"] boolValue];
            if (valid) {
                self.daysRemaining = [data[@"daysRemaining"] intValue];
                NSString *packageName = data[@"packageName"] ?: @"Pacote";
                
                self.statusLabel.textColor = [UIColor colorWithRed:0.0 green:1.0 blue:0.0 alpha:1.0];
                self.statusLabel.text = [NSString stringWithFormat:@"✓ ACESSO LIBERADO!\\n\\nPacote: %@\\nDias: %d", packageName, self.daysRemaining];
                
                dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(1.0 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
                    [self dismissViewControllerAnimated:YES completion:nil];
                });
            } else {
                [[NSUserDefaults standardUserDefaults] removeObjectForKey:@"com.apiserver.key"];
                [[NSUserDefaults standardUserDefaults] synchronize];
                self.currentKey = nil;
                [self showKeyInputState];
            }
        });
    }];
}

- (void)callAPI:(NSString *)method data:(NSDictionary *)data completion:(void(^)(NSDictionary *, NSError *))completion {
    NSURL *url = [NSURL URLWithString:[NSString stringWithFormat:@"%@/%@?batch=1", kAPIEndpoint, method]];
    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url];
    [request setHTTPMethod:@"POST"];
    [request setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];
    NSDictionary *batchData = @{@"0": data};
    NSData *postData = [NSJSONSerialization dataWithJSONObject:batchData options:0 error:nil];
    [request setHTTPBody:postData];
    [[[NSURLSession sharedSession] dataTaskWithRequest:request completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        if (error) { completion(nil, error); return; }
        NSArray *results = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
        if (![results isKindOfClass:[NSArray class]] || results.count == 0) { completion(nil, [NSError errorWithDomain:@"API" code:-1 userInfo:nil]); return; }
        completion(results[0], nil);
    }] resume];
}
@end

@implementation APIServerSDK
+ (instancetype)sharedInstance {
    static APIServerSDK *instance = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{ instance = [[self alloc] init]; });
    return instance;
}

- (void)initialize {
    NSLog(@"[APIServer] SDK Loaded. Waiting for game UI...");
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(2.0 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        [self showUI];
    });
}

- (void)showUI {
    UIWindow *window = nil;
    if (@available(iOS 13.0, *)) {
        for (UIWindowScene *scene in [UIApplication sharedApplication].connectedScenes) {
            if (scene.activationState == UISceneActivationStateForegroundActive && [scene isKindOfClass:[UIWindowScene class]]) {
                window = ((UIWindowScene *)scene).windows.firstObject;
                break;
            }
        }
    }
    if (!window) window = [UIApplication sharedApplication].keyWindow;
    if (!window) window = [[UIApplication sharedApplication] windows].firstObject;
    
    if (window) {
        APIServerUI *vc = [[APIServerUI alloc] init];
        vc.modalPresentationStyle = UIModalPresentationOverFullScreen;
        UIViewController *root = window.rootViewController;
        while (root.presentedViewController) root = root.presentedViewController;
        [root presentViewController:vc animated:YES completion:nil];
        NSLog(@"[APIServer] UI Presented successfully.");
    } else {
        NSLog(@"[APIServer] Error: No window found. Retrying in 2s...");
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(2.0 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{ [self showUI]; });
    }
}
@end

__attribute__((constructor))
static void APIServerInit(void) {
    [[APIServerSDK sharedInstance] initialize];
}
\`;
}

export const dylibRouter = router({
  generate: protectedProcedure
    .input(z.object({
      packageId: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const pkg = await getPackageById(input.packageId);
      if (!pkg) throw new TRPCError({ code: "NOT_FOUND", message: "Pacote não encontrado" });
      
      const content = generateDylibContent({
        name: pkg.name,
        token: pkg.token,
        version: pkg.version,
      });
      
      const buildId = nanoid();
      const fileName = `${pkg.name}_v${pkg.version}_${buildId.substring(0, 6)}.dylib`;
      const publicDir = path.join(process.cwd(), "public", "builds");
      
      try {
        await fs.mkdir(publicDir, { recursive: true });
        const filePath = path.join(publicDir, fileName);
        await fs.writeFile(filePath, content);
        
        await createDylibBuild({
          id: buildId,
          packageId: pkg.id,
          ownerId: ctx.user.id,
          fileName,
          status: "completed",
        });
        
        return { success: true, downloadUrl: `/builds/${fileName}` };
      } catch (error) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Erro ao gerar dylib" });
      }
    }),
  getBuilds: protectedProcedure
    .input(z.object({ packageId: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      if (input.packageId) return getDylibBuildsByPackage(input.packageId);
      return getDylibBuildsByOwner(ctx.user.id);
    }),
});
